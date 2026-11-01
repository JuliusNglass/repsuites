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
export const HQ_DEFAULT_URL = "https://efmdtpvbiibiuhmnryoe.supabase.co/functions/v1/crm-event";
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
