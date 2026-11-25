/* eslint-disable @typescript-eslint/no-explicit-any */
// Server-only Paystack client (fetch, no SDK, runs on Cloudflare Workers).
// Needs REPSUITES_PAYSTACK_SECRET_KEY (sk_test_... or sk_live_...).
// Docs: https://paystack.com/docs/api/transaction/ and
// https://paystack.com/docs/payments/webhooks/ (x-paystack-signature is
// HMAC-SHA512 of the raw body with the secret key).

export function paystackReady(): boolean {
  return !!(process.env["REPSUITES_PAYSTACK_SECRET_KEY"] ?? "").trim();
}

export async function paystack<T = any>(
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const key = (process.env["REPSUITES_PAYSTACK_SECRET_KEY"] ?? "").trim();
  if (!key) return { ok: false, error: "Payments are not switched on yet." };
  try {
    const r = await fetch(`https://api.paystack.co/${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => null)) as any;
    if (!r.ok || !j?.status)
      return { ok: false, error: String(j?.message ?? r.status).slice(0, 200) };
    return { ok: true, data: j.data as T };
  } catch {
    return { ok: false, error: "Paystack could not be reached. Try again." };
  }
}

export const PS_REF_RE = /^ps_[A-Za-z0-9]{16,64}$/;

export function newPaystackRef(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return "ps_" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function verifyPaystackSignature(raw: string, sig: string | null): Promise<boolean> {
  const key = (process.env["REPSUITES_PAYSTACK_SECRET_KEY"] ?? "").trim();
  if (!key || !sig) return false;
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** A successful Paystack transaction, turned into a paid Fix-it order. */
export async function ngPaystackPaid(tx: any): Promise<boolean> {
  const ref = String(tx?.reference ?? "");
  const m = tx?.metadata ?? {};
  if (!PS_REF_RE.test(ref) || tx?.status !== "success" || m.kind !== "fixit_ng") return false;
  if (String(tx?.currency ?? "").toUpperCase() !== "NGN") return false;
  // Never trust the amount from the page: it must match what we charged.
  if (Number(tx?.amount) !== Number(m.amount_kobo)) return false;
  const { recordFixitOrder } = await import("./fixit-pack.server");
  const email = String(tx?.customer?.email ?? m.email ?? "").toLowerCase() || null;
  const phone = String(m.phone ?? "") || null;
  await recordFixitOrder({
    id: ref,
    metadata: { business: m.business ?? "", offer: `ng_${m.tier}`, token: "" },
    customer_details: { email, phone, name: m.name ?? null },
    ng: { tier: m.tier, amount: Number(tx.amount), provider: "paystack" },
  });
  const { addGhlTags } = await import("./ghl-lead.server");
  await addGhlTags({
    email,
    phone,
    tags: ["fixit-ng", `fixit-ng-${m.tier}`, `fixit-ng-p${m.price}`],
  }).catch(() => false);
  return true;
}
