// Server-only: a small Stripe client using fetch (no SDK, so it runs on
// Cloudflare Workers). Needs REPSUITES_STRIPE_SECRET_KEY, and
// REPSUITES_STRIPE_WEBHOOK_SECRET for the webhook.

export function stripeReady(): boolean {
  return !!(process.env["REPSUITES_STRIPE_SECRET_KEY"] ?? "").trim();
}

// Stripe takes form encoding with nested keys: line_items[0][price_data][currency]=gbp
function flatten(obj: unknown, prefix: string, out: URLSearchParams) {
  if (obj === undefined || obj === null) return;
  if (Array.isArray(obj)) obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  else if (typeof obj === "object")
    for (const [k, v] of Object.entries(obj as Record<string, unknown>))
      flatten(v, prefix ? `${prefix}[${k}]` : k, out);
  else out.append(prefix, String(obj));
}

export async function stripe<T = any>(
  path: string,
  body?: Record<string, unknown>,
  method: "GET" | "POST" = body ? "POST" : "GET",
  // Stripe's Idempotency-Key header: a retried POST with the same key returns
  // the first result instead of doing it twice.
  // https://docs.stripe.com/api/idempotent_requests
  opts: { idempotencyKey?: string } = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const key = (process.env["REPSUITES_STRIPE_SECRET_KEY"] ?? "").trim();
  if (!key) return { ok: false, error: "Payments are not switched on yet." };
  const form = new URLSearchParams();
  if (body) flatten(body, "", form);
  try {
    const r = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      ...(method === "POST" ? { body: form.toString() } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const data = (await r.json().catch(() => null)) as any;
    if (!r.ok) return { ok: false, error: String(data?.error?.message ?? r.status).slice(0, 200) };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Stripe could not be reached. Try again." };
  }
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Checks the Stripe-Signature header: HMAC-SHA256 of "<t>.<raw body>" with the
// endpoint secret, and the timestamp within 5 minutes.
export async function verifyStripeSignature(raw: string, header: string | null): Promise<boolean> {
  const secret = (process.env["REPSUITES_STRIPE_WEBHOOK_SECRET"] ?? "").trim();
  if (!secret || !header) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  return sigs.some((s) => {
    if (s.length !== mac.length) return false;
    let d = 0;
    for (let i = 0; i < s.length; i++) d |= s.charCodeAt(i) ^ mac.charCodeAt(i);
    return d === 0;
  });
}
