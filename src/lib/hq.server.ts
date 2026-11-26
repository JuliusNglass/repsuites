// Server-only: tell Accelur8 HQ (the central CRM) what happened in RepSuites,
// e.g. a business signed up, paid, or a prospect was sent their report.
// Signed per the HQ contract: x-accelur8-timestamp (unix seconds) and
// x-accelur8-signature (lowercase hex HMAC-SHA256 of "<timestamp>.<raw body>")
// with HQ_CRM_SECRET. Best effort: never throws, never blocks or fails the
// RepSuites action, one call per action (Workers allow 50 outside calls per
// request). No-op until HQ_CRM_SECRET is set.
import { hqBody, type HqEvent } from "./hq";
import { serviceRead } from "./supabase-service.server";

const env = (k: string) => (process.env[k] ?? "").trim();
// Accelur8 HQ is retired: events now land in the Accelur8 SparkOps account.
export const HQ_DEFAULT_URL =
  "https://ops.accelur8clientwork.com/api/crm-event/d4cc38b767a7bb2de274c0696d7da1cc82bd";
const TIMEOUT_MS = 4000;

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function signHq(secret: string, ts: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${raw}`)));
}

// The request we would send, signed. Split out so tests can check it without
// calling HQ.
export async function buildHqRequest(e: HqEvent, secret: string, now = Date.now()) {
  const raw = JSON.stringify(hqBody(e));
  const ts = String(Math.floor(now / 1000));
  return {
    url: env("HQ_CRM_URL") || HQ_DEFAULT_URL,
    raw,
    headers: {
      "Content-Type": "application/json",
      "x-accelur8-timestamp": ts,
      "x-accelur8-signature": await signHq(secret, ts, raw),
    },
  };
}

export async function sendHqEvent(e: HqEvent): Promise<boolean> {
  try {
    const secret = env("HQ_CRM_SECRET");
    if (!secret) return false;
    const req = await buildHqRequest(e, secret);
    const r = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: req.raw,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) console.warn(`HQ ${e.event} ${e.idempotency_key}: ${r.status}`);
    return r.ok;
  } catch (err) {
    console.warn(`HQ ${e?.event} failed: ${String((err as Error)?.message ?? err).slice(0, 120)}`);
    return false;
  }
}

// Builds the event and sends it; anything that goes wrong (a failed lookup,
// a bad field) is swallowed, so callers can just await it after their work.
export async function hqAfter(
  build: () => HqEvent | null | Promise<HqEvent | null>,
): Promise<boolean> {
  try {
    const e = await build();
    return e ? await sendHqEvent(e) : false;
  } catch {
    return false;
  }
}

// The business and its owner, for events where we only know the tenant.
// At most three outside calls: the business, its owner membership, and the
// owner's email from Supabase Auth.
export async function tenantParty(tenantId: string): Promise<{
  business: string | null;
  ownerName: string | null;
  email: string | null;
}> {
  const none = { business: null, ownerName: null, email: null };
  try {
    const t = await serviceRead<{ name: string; settings: Record<string, unknown> | null }[]>(
      `tenants?select=name,settings&id=eq.${tenantId}`,
      "",
    );
    const row = t.data?.[0];
    if (!row) return none;
    const ownerName =
      typeof row.settings?.["owner_name"] === "string" ? row.settings["owner_name"] : null;
    let email: string | null = null;
    const m = await serviceRead<{ user_id: string }[]>(
      `tenant_memberships?select=user_id&tenant_id=eq.${tenantId}&role=eq.owner&active=eq.true&limit=1`,
      "",
    );
    const userId = m.data?.[0]?.user_id;
    if (userId) {
      const { adminAuth } = await import("./signup.server");
      const u = await adminAuth(`users/${userId}`, "GET");
      const e = String(u.data?.email ?? u.data?.user?.email ?? "");
      email = e.includes("@") ? e.toLowerCase() : null;
    }
    return { business: row.name ?? null, ownerName, email };
  } catch {
    return none;
  }
}

/** Like sendHqEvent, but returns the reply body (e.g. the lead's SparkOps
 * booking link for lead_captured). Null on any failure. */
export async function sendHqEventReply(e: HqEvent): Promise<Record<string, unknown> | null> {
  try {
    const secret = env("HQ_CRM_SECRET");
    if (!secret) return null;
    const req = await buildHqRequest(e, secret);
    const r = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: req.raw,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The 36-hex booking token from a SparkOps booking link, or null. */
export function bookToken(url: unknown): string | null {
  const m = typeof url === "string" ? /\/lead\/([0-9a-f]{36})$/.exec(url) : null;
  return m ? m[1]! : null;
}

/** UK-style phone to +44 form, to match GHL contact phones. Null if too short. */
export function plusPhone(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  if (d.startsWith("0")) return `+44${d.slice(1)}`;
  return `+${d}`;
}

/**
 * Text someone from the Accelur8 SparkOps number (replaces GHL texting), so
 * replies land in SparkOps Conversations. A repeat idempotency key sends
 * nothing. Never throws.
 */
export async function sendAccelur8Sms(a: {
  phone: string;
  message: string;
  idempotencyKey: string;
  source?: string;
}): Promise<boolean> {
  try {
    const url = env("HQ_CRM_URL") || HQ_DEFAULT_URL;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "send_sms",
        phone: a.phone,
        message: a.message,
        idempotency_key: a.idempotencyKey,
        source: a.source ?? "repsuites",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.warn(`Accelur8 SMS ${a.idempotencyKey}: ${r.status}`);
    return r.ok;
  } catch (err) {
    console.warn("Accelur8 SMS failed", err);
    return false;
  }
}
