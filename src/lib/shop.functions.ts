// Card shop checkout and plan subscriptions (Stripe Checkout).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { stripe, stripeReady } from "./stripe.server";
import {
  findCardPack,
  findStandPack,
  GROWTH,
  planPence,
  type BillingInterval,
  type PaidPlan,
} from "./shop";

const ORIGIN = "https://repsuites.com";
const PLACE_RE = /^[A-Za-z0-9_-]{10,300}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const shopStatus = createServerFn({ method: "GET" }).handler(async () => ({
  ready: stripeReady(),
}));

export const startCardCheckout = createServerFn({ method: "POST" })
  .validator(
    (d: {
      cards: string | null;
      stands: string | null;
      businessName: string;
      placeId?: string;
      message?: string;
    }) =>
      z
        .object({
          cards: z.string().max(20).nullable(),
          stands: z.string().max(20).nullable(),
          businessName: z.string().trim().min(2).max(120),
          placeId: z.string().regex(PLACE_RE).optional(),
          message: z.string().trim().max(120).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    const cards = findCardPack(data.cards);
    const stands = findStandPack(data.stands);
    if (!cards && !stands) return { ok: false as const, error: "Choose cards or a stand." };

    // A light brake on abuse: at most 40 unpaid orders started in an hour.
    const since = new Date(Date.now() - 3600_000).toISOString();
    const recent = await serviceRead<{ id: string }[]>(
      `shop_orders?select=id&status=eq.pending&created_at=gte.${since}&limit=41`,
      "",
    );
    if ((recent.data?.length ?? 0) > 40)
      return { ok: false as const, error: "We are busy right now. Please try again shortly." };

    const items = [
      ...(cards ? [{ kind: "cards", pack: cards.id, qty: cards.qty, pence: cards.pence }] : []),
      ...(stands ? [{ kind: "stand", pack: stands.id, qty: stands.qty, pence: stands.pence }] : []),
    ];
    const total = items.reduce((t, i) => t + i.pence, 0);
    const reviewUrl = data.placeId
      ? `https://search.google.com/local/writereview?placeid=${data.placeId}`
      : null;
    const ins = await serviceWrite<{ id: string }[]>("shop_orders", "", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        items,
        total_pence: total,
        business_name: data.businessName,
        google_place_id: data.placeId ?? null,
        review_url: reviewUrl,
        card_message: data.message || null,
      },
    });
    const orderId = ins.data?.[0]?.id;
    if (!orderId) return { ok: false as const, error: "Could not start your order. Try again." };

    const line = (name: string, desc: string, pence: number) => ({
      quantity: 1,
      price_data: {
        currency: "gbp",
        unit_amount: pence,
        product_data: { name, description: desc },
      },
    });
    const s = await stripe<{ id: string; url: string }>("checkout/sessions", {
      mode: "payment",
      client_reference_id: orderId,
      metadata: { kind: "shop", order_id: orderId },
      payment_intent_data: { metadata: { kind: "shop", order_id: orderId } },
      line_items: [
        ...(cards
          ? [
              line(
                `${cards.qty} NFC review card${cards.qty === 1 ? "" : "s"}`,
                `Printed for ${data.businessName}. Tap or scan to leave a review.`,
                cards.pence,
              ),
            ]
          : []),
        ...(stands
          ? [
              line(
                `${stands.qty} A5 table stand${stands.qty === 1 ? "" : "s"}`,
                `Printed for ${data.businessName}, with NFC and QR code.`,
                stands.pence,
              ),
            ]
          : []),
      ],
      shipping_address_collection: { allowed_countries: ["GB"] },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: "Free UK delivery",
            type: "fixed_amount",
            fixed_amount: { amount: 0, currency: "gbp" },
            delivery_estimate: {
              minimum: { unit: "business_day", value: 3 },
              maximum: { unit: "business_day", value: 7 },
            },
          },
        },
      ],
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${ORIGIN}/cards/thanks?order=${orderId}`,
      cancel_url: `${ORIGIN}/cards/order?back=1`,
    });
    if (!s.ok) return { ok: false as const, error: s.error };
    await serviceWrite(`shop_orders?id=eq.${orderId}`, "", {
      method: "PATCH",
      body: { stripe_session_id: s.data.id, updated_at: new Date().toISOString() },
    });
    return { ok: true as const, url: s.data.url };
  });

export const getShopOrder = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => z.object({ id: z.string().regex(UUID_RE) }).parse(d))
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    const r = await serviceRead<{ business_name: string; status: string; items: unknown }[]>(
      `shop_orders?select=business_name,status,items&id=eq.${data.id}`,
      "",
    );
    const o = r.data?.[0];
    return o
      ? { ok: true as const, businessName: o.business_name, status: o.status }
      : { ok: false as const };
  });

const BILLERS = ["owner", "admin", "super_admin"];

async function billingGuard() {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: "signin" };
  if (!BILLERS.includes(g.session.role || ""))
    return { ok: false as const, error: "Only the business owner can change the plan." };
  if (!(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Please refresh the page and try again." };
  return {
    ok: true as const,
    tenantId: g.session.active_tenant_id!,
    email: g.session.email,
    userId: g.session.user_id,
  };
}

export const startPlanCheckout = createServerFn({ method: "POST" })
  .validator((d: { plan: PaidPlan; interval?: BillingInterval }) =>
    z
      .object({
        plan: z.literal("gold"),
        interval: z.enum(["month", "year"]).default("month"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await billingGuard();
    if (!g.ok) return g;
    {
      const { emailUnconfirmed } = await import("./email-check.server");
      const unconfirmed = await emailUnconfirmed(g.userId);
      if (unconfirmed) return { ok: false as const, error: unconfirmed };
    }
    const b = await serviceRead<{ stripe_customer_id: string | null; status: string | null }[]>(
      `tenant_billing?select=stripe_customer_id,status&tenant_id=eq.${g.tenantId}`,
      "",
    );
    const bill = b.data?.[0];
    if (bill?.status && ["active", "trialing", "past_due"].includes(bill.status))
      return { ok: false as const, error: "manage" };
    const s = await stripe<{ url: string }>("checkout/sessions", {
      mode: "subscription",
      client_reference_id: g.tenantId,
      ...(bill?.stripe_customer_id
        ? { customer: bill.stripe_customer_id }
        : { customer_email: g.email }),
      metadata: { kind: "plan", tenant_id: g.tenantId, plan: data.plan },
      subscription_data: { metadata: { kind: "plan", tenant_id: g.tenantId, plan: data.plan } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: planPence(data.interval),
            recurring: { interval: data.interval },
            product_data: { name: GROWTH.name },
          },
        },
      ],
      allow_promotion_codes: true,
      success_url: `${ORIGIN}/api/billing/back?paid=1`,
      cancel_url: `${ORIGIN}/pricing`,
    });
    return s.ok ? { ok: true as const, url: s.data.url } : { ok: false as const, error: s.error };
  });

export const openBillingPortal = createServerFn({ method: "POST" }).handler(async () => {
  const g = await billingGuard();
  if (!g.ok) return g;
  const b = await serviceRead<{ stripe_customer_id: string | null }[]>(
    `tenant_billing?select=stripe_customer_id&tenant_id=eq.${g.tenantId}`,
    "",
  );
  const customer = b.data?.[0]?.stripe_customer_id;
  if (!customer) return { ok: false as const, error: "No plan to manage yet." };
  const s = await stripe<{ url: string }>("billing_portal/sessions", {
    customer,
    return_url: `${ORIGIN}/api/billing/back`,
  });
  return s.ok ? { ok: true as const, url: s.data.url } : { ok: false as const, error: s.error };
});

export const getMyBilling = createServerFn({ method: "GET" }).handler(async () => {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const };
  const t = g.session.active_tenant_id!;
  const [p, b] = await Promise.all([
    serviceRead<{ plan: string }[]>(`tenant_plans?select=plan&tenant_id=eq.${t}`, ""),
    serviceRead<{ status: string | null; current_period_end: string | null }[]>(
      `tenant_billing?select=status,current_period_end&tenant_id=eq.${t}`,
      "",
    ),
  ]);
  return {
    ok: true as const,
    plan: p.data?.[0]?.plan ?? "free",
    status: b.data?.[0]?.status ?? null,
    renews: b.data?.[0]?.current_period_end ?? null,
    canManage: BILLERS.includes(g.session.role || ""),
  };
});
