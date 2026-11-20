/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe/Supabase JSON is checked field by field. */
// Server-only: the £1 review trial.
//
// 1. startReviewTrial: a Stripe Checkout Session in subscription mode with
//    Growth (£49 a month) on a 30-day trial plus a one-off £1 line, which
//    Stripe charges on the first invoice. Card and phone are collected there.
// 2. The buyer lands on /try/next. finishReviewTrial checks the session is
//    paid, makes their RepSuites account (business, QR link, Growth plan,
//    texting switched on, owner login by email), tags the subscription with
//    the business so the webhook keeps the plan in step, and queues the first
//    review request. Safe to run twice: it reuses the business already made.
// No em dashes in user-facing copy (AGENTS.md).
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { stripe } from "./stripe.server";
import { PLAN_FEATURES } from "./shop";
import { reviewUrl } from "./signup";
import {
  TRIAL_DAYS,
  TRIAL_ENTRY_PENCE,
  TRIAL_MONTH_PENCE,
  TRIAL_SMS_CAP,
  trialChannel,
  trialSender,
  type TrialCustomer,
} from "./review-trial";
import { TRIAL_PRODUCTS, ensureProduct } from "./trial.server";

const ORIGIN = "https://repsuites.com";

export function reviewTrialCheckoutBody(o: { token: string; business: string; email: string }) {
  const meta = {
    kind: "review_trial",
    product: "repsuites",
    token: o.token,
    business: o.business.slice(0, 120),
  };
  return {
    mode: "subscription",
    ...(o.email ? { customer_email: o.email } : {}),
    ...(o.token ? { client_reference_id: o.token } : {}),
    metadata: meta,
    subscription_data: { trial_period_days: TRIAL_DAYS, metadata: meta },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          product: TRIAL_PRODUCTS.gold.id,
          unit_amount: TRIAL_MONTH_PENCE,
          recurring: { interval: "month" },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: TRIAL_ENTRY_PENCE,
          product_data: {
            name: "First 30 days",
            description: "Review requests in your business name. £49 a month after day 30.",
          },
        },
      },
    ],
    phone_number_collection: { enabled: true },
    custom_text: {
      submit: {
        message:
          "£1 today for your first 30 days, then £49 a month. Cancel any time before day 30 and you won't pay again.",
      },
    },
    success_url: `${ORIGIN}/try/next?s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${ORIGIN}/try${o.token ? `?r=${o.token}` : ""}`,
  };
}

export async function startReviewTrial(o: { token: string; business: string; email: string }) {
  await ensureProduct("gold");
  const s = await stripe<{ url: string }>("checkout/sessions", reviewTrialCheckoutBody(o));
  return s.ok ? { ok: true as const, url: s.data.url } : { ok: false as const, error: s.error };
}

export interface TrialSession {
  id: string;
  paid: boolean;
  email: string;
  phone: string;
  name: string;
  business: string;
  token: string;
  customer: string;
  subscription: string;
}

export async function readTrialSession(id: string): Promise<TrialSession | null> {
  const r = await stripe<any>(`checkout/sessions/${id}`, undefined, "GET");
  const s = r.ok ? r.data : null;
  if (!s || s.metadata?.kind !== "review_trial") return null;
  const cd = s.customer_details ?? {};
  return {
    id: String(s.id),
    // A trial checkout is "complete" with the £1 paid, or no_payment_required
    // if a promo code took it to zero.
    paid: s.status === "complete" && ["paid", "no_payment_required"].includes(s.payment_status),
    email: String(cd.email ?? s.customer_email ?? "").toLowerCase(),
    phone: String(cd.phone ?? ""),
    name: String(cd.name ?? ""),
    business: String(s.metadata?.business ?? ""),
    token: String(s.metadata?.token ?? ""),
    customer: typeof s.customer === "string" ? s.customer : String(s.customer?.id ?? ""),
    subscription:
      typeof s.subscription === "string" ? s.subscription : String(s.subscription?.id ?? ""),
  };
}

/** The business name and Google place we already know from the free check. */
export async function knownBusiness(token: string) {
  if (!token) return null;
  const p = await serviceRead<{ name: string | null; place_id: string | null }[]>(
    `prospects?select=name,place_id&report_token=eq.${encodeURIComponent(token)}&limit=1`,
    "",
  );
  const row = p.data?.[0];
  return row?.name ? { name: String(row.name), placeId: String(row.place_id ?? "") } : null;
}

async function tenantForSession(id: string): Promise<string> {
  const r = await serviceRead<{ id: string }[]>(
    `tenants?select=id&settings->>trial_session=eq.${encodeURIComponent(id)}&limit=1`,
    "",
  );
  return r.data?.[0]?.id ?? "";
}

export async function finishReviewTrial(
  s: TrialSession,
  biz: { name: string; placeId: string },
  person: TrialCustomer,
): Promise<
  | { ok: true; business: string; channel: "sms" | "email"; owner: string }
  | { ok: false; error: string }
> {
  if (!s.paid)
    return { ok: false, error: "We can't see your £1 payment yet. Try again in a moment." };
  if (!s.email) return { ok: false, error: "No email came through with your payment." };
  const business = biz.name.trim().slice(0, 120) || s.business || "Your business";

  let tenantId = await tenantForSession(s.id);
  if (!tenantId) {
    const t = await serviceWrite<{ id: string }[]>("tenants", "", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        name: business,
        settings: {
          source: "review_trial",
          trial_session: s.id,
          owner_name: s.name,
          owner_phone: s.phone,
          ...(biz.placeId ? { place_id: biz.placeId } : {}),
          ...(s.token ? { report_token: s.token } : {}),
        },
      },
    });
    tenantId = t.data?.[0]?.id ?? "";
    if (!tenantId) return { ok: false, error: "We couldn't set up your account. Try again." };
    await serviceWrite("qr_links", "", {
      method: "POST",
      body: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        kind: "business",
        active: true,
        business_name: business,
        google_place_id: biz.placeId || null,
        target_url: biz.placeId ? reviewUrl(biz.placeId) : null,
      },
    }).catch(() => null);
  }

  await serviceWrite("tenant_plans?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: { tenant_id: tenantId, plan: "gold", features: PLAN_FEATURES.gold },
  });
  await serviceWrite("review_sms_settings?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      tenant_id: tenantId,
      enabled: true,
      sender: trialSender(business),
      monthly_cap: TRIAL_SMS_CAP,
      updated_at: new Date().toISOString(),
    },
  });
  if (s.subscription) {
    await serviceWrite("tenant_billing?on_conflict=tenant_id", "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: {
        tenant_id: tenantId,
        stripe_customer_id: s.customer || null,
        stripe_subscription_id: s.subscription,
        plan: "gold",
        status: "trialing",
        updated_at: new Date().toISOString(),
      },
    }).catch(() => null);
    // From here the normal webhook keeps the plan in step (stripe-webhook.server.ts).
    await stripe(`subscriptions/${s.subscription}`, {
      metadata: {
        kind: "plan",
        product: "repsuites",
        tenant_id: tenantId,
        plan: "gold",
        trial: "review",
      },
    }).catch(() => null);
  }

  const { giveOwner } = await import("./add-business.server");
  const owner = await giveOwner(tenantId, business, s.email, s.name);

  const channel = trialChannel(person);
  const { queueRequests } = await import("./review-requests.server");
  const q = await queueRequests(
    tenantId,
    [
      {
        name: person.name.trim(),
        phone: person.phone.trim() || null,
        email: person.email.trim() || null,
        channel,
      },
    ],
    {
      dueAt: new Date().toISOString(),
      source: "trial",
      event: null,
      externalId: `trial-${s.id}`,
      createdBy: null,
      hq: true,
    },
  );
  if (!q.ok && q.error !== "duplicate") return { ok: false, error: q.error };
  return { ok: true, business, channel, owner: owner.status };
}
