/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe JSON is checked field by field. */
// Events RepSuites sends to Accelur8 HQ (the central CRM). Pure, so the
// mapping can be tested; the signed send is in hq.server.ts. HQ maps events to
// pipeline stages itself, so we only ever send event names, never stages.
// Idempotency keys are deterministic: HQ ignores a key it has already seen.

export const HQ_EVENTS = [
  "lead_captured",
  "prospect_created",
  "prospect_sent",
  "signed_up",
  "trial_started",
  "plan_paid",
  "payment_failed",
  "cancelled",
  "opted_out",
  // Activity only (no stage change).
  "review_requested",
  "client_added",
] as const;
export type HqEventName = (typeof HQ_EVENTS)[number];

export interface HqEvent {
  event: HqEventName;
  idempotency_key: string;
  occurred_at?: string;
  contact: { email?: string | null; phone?: string | null; name?: string | null; role?: string };
  company?: {
    name?: string | null;
    website?: string | null;
    town?: string | null;
    country?: string | null;
  };
  product_link?: { type: "tenant" | "stripe_customer" | "prospect"; id: string };
  value_pence?: number;
  data?: Record<string, unknown>;
  // "product_customer": an opt-out by a RepSuites business's own customer.
  // HQ stores the opt-out only and makes no CRM contact.
  scope?: "product_customer";
}

// The exact JSON HQ receives.
export function hqBody(e: HqEvent) {
  const { product_link, ...rest } = e;
  return {
    source: "repsuites" as const,
    ...rest,
    occurred_at: e.occurred_at ?? new Date().toISOString(),
    ...(product_link ? { product_link: { product: "repsuites" as const, ...product_link } } : {}),
  };
}

// ---------- Stripe ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANS = ["starter", "pro", "gold", "managed"];

// Which HQ event a Stripe event is (others are not sent).
export function hqEventForStripe(type: string, obj: any): HqEventName | null {
  if (type === "invoice.paid" && Number(obj?.amount_paid ?? 0) > 0) return "plan_paid";
  if (type === "invoice.payment_failed") return "payment_failed";
  if (type === "customer.subscription.deleted") return "cancelled";
  if (type === "customer.subscription.created" && obj?.status === "trialing")
    return "trial_started";
  return null;
}

// The subscription metadata on a subscription or an invoice (Stripe has put
// it in a few places over API versions).
export function stripeMetadata(obj: any): Record<string, string> {
  const candidates = [
    obj?.object === "invoice" ? null : obj?.metadata,
    obj?.parent?.subscription_details?.metadata,
    obj?.subscription_details?.metadata,
    ...(Array.isArray(obj?.lines?.data) ? obj.lines.data.map((l: any) => l?.metadata) : []),
  ];
  for (const m of candidates)
    if (m && typeof m === "object" && (m.tenant_id || m.product || m.kind)) return m;
  return {};
}

// Only RepSuites plan subscriptions. Older ones have no product label but are
// kind "plan" with a RepSuites plan; anything labelled for another product
// (the Stripe account may be shared) is left alone.
export function isRepsuitesBilling(meta: Record<string, string>): boolean {
  if (meta["product"]) return meta["product"] === "repsuites";
  return meta["kind"] === "plan" && PLANS.includes(String(meta["plan"] ?? ""));
}

// What a subscription costs per period, in pence.
export function subscriptionPence(sub: any): number | null {
  const items = Array.isArray(sub?.items?.data) ? sub.items.data : [];
  let total = 0;
  for (const i of items) {
    const unit = Number(i?.price?.unit_amount ?? i?.plan?.amount);
    if (!Number.isFinite(unit)) return null;
    total += unit * (Number(i?.quantity ?? 1) || 1);
  }
  return items.length ? Math.round(total) : null;
}

// Everything about a Stripe event except who the business is (looked up
// from the tenant on the server). Null: not something HQ hears about.
export function stripeHqEvent(event: any): (HqEvent & { tenantId: string | null }) | null {
  const type = String(event?.type ?? "");
  const obj = event?.data?.object ?? {};
  const name = hqEventForStripe(type, obj);
  if (!name || !event?.id) return null;
  const meta = stripeMetadata(obj);
  if (!isRepsuitesBilling(meta)) return null;
  const tenantId = UUID_RE.test(String(meta["tenant_id"] ?? "")) ? String(meta["tenant_id"]) : null;
  const customer = typeof obj.customer === "string" ? obj.customer : String(obj.customer?.id ?? "");
  const isInvoice = type.startsWith("invoice.");
  const value = isInvoice
    ? Number(name === "plan_paid" ? obj.amount_paid : obj.amount_due)
    : subscriptionPence(obj);
  if (!tenantId && !customer) return null;
  return {
    tenantId,
    event: name,
    idempotency_key: `stripe:${String(event.id)}`,
    occurred_at: new Date(Number(event.created ?? Date.now() / 1000) * 1000).toISOString(),
    contact: {
      email: isInvoice ? (obj.customer_email ?? null) : null,
      name: isInvoice ? (obj.customer_name ?? null) : null,
      role: "owner",
    },
    product_link: tenantId
      ? { type: "tenant", id: tenantId }
      : { type: "stripe_customer", id: customer },
    ...(value !== null && Number.isFinite(value) ? { value_pence: Math.round(value) } : {}),
    data: {
      stripe_event: type,
      stripe_customer: customer || null,
      ...(meta["plan"] ? { plan: meta["plan"] } : {}),
      ...(isInvoice && obj.id ? { stripe_invoice: String(obj.id) } : {}),
      ...(!isInvoice && obj.id ? { stripe_subscription: String(obj.id) } : {}),
    },
  };
}

// ---------- prospects ----------

export interface HqProspect {
  id: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  town?: string | null;
  report_token?: string | null;
  product?: string | null;
}

export function prospectHqEvent(
  kind: "prospect_created" | "prospect_sent",
  p: HqProspect,
  data: Record<string, unknown> = {},
): HqEvent {
  const suffix = kind === "prospect_created" ? "created" : "sent";
  return {
    event: kind,
    idempotency_key: `prospect:${p.id}:${suffix}`,
    contact: {
      email: p.email || null,
      phone: p.phone || null,
      name: p.contact_name || null,
      role: "owner",
    },
    company: {
      name: p.name || null,
      website: p.website || null,
      town: p.town || null,
    },
    product_link: { type: "prospect", id: p.id },
    data: {
      // Which product the prospect was pitched (the prospect tool serves both).
      product: p.product === "sparkops" ? "sparkops" : "repsuites",
      ...(p.report_token ? { report_url: `https://repsuites.com/r/${p.report_token}` } : {}),
      ...data,
    },
  };
}

// ---------- a RepSuites business's own customers ----------

// A customer of a RepSuites business opted out of its review emails or texts
// (unsubscribe link or spam complaint). HQ stores the opt-out only: no CRM
// contact, since they are not Accelur8's lead.
export function customerOptOutEvent(o: {
  requestId: string;
  tenantId: string;
  business: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  how: "unsubscribe" | "spam_complaint";
}): HqEvent {
  return {
    event: "opted_out",
    scope: "product_customer",
    idempotency_key: `review_request:${o.requestId}:opted_out`,
    contact: { email: o.email || null, phone: o.phone || null, name: o.name || null },
    company: { name: o.business || null },
    product_link: { type: "tenant", id: o.tenantId },
    data: { channel: "review_requests", how: o.how, review_request_id: o.requestId },
  };
}

// Activity only: a business queued review requests (one event per batch).
export function reviewRequestedEvent(o: {
  tenantId: string;
  batchKey: string;
  business: string | null;
  added: number;
  skipped: number;
  source: string;
  channels: string[];
}): HqEvent {
  return {
    event: "review_requested",
    idempotency_key: `review_requests:${o.tenantId}:${o.batchKey}`,
    contact: { role: "owner" },
    company: { name: o.business || null },
    product_link: { type: "tenant", id: o.tenantId },
    data: { added: o.added, skipped: o.skipped, source: o.source, channels: o.channels },
  };
}
