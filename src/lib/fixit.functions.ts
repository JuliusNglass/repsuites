// Fix-It Pack checkout (Stripe Checkout, one-off payment). Public: anyone
// with the sales page can buy. The report token, when present, links the
// payment back to the report so we know which business to fix.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { applyNoStoreHeaders, verifyRequestOriginAsync } from "./auth.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { findStandPack } from "./shop";
import { stripe, stripeReady } from "./stripe.server";
import { cleanToken, FIXIT_PENCE, PACK27_PENCE } from "./fixit";

const ORIGIN = "https://repsuites.com";

export const fixitBusiness = createServerFn({ method: "GET" })
  .validator((d: { token?: string }) => z.object({ token: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    const token = cleanToken(data.token);
    if (!token) return { name: null as string | null };
    const r = await serviceRead<{ name: string | null }[]>(
      `prospects?select=name&report_token=eq.${token}`,
      "",
    );
    return { name: r.data?.[0]?.name ?? null };
  });

export const startFixitCheckout = createServerFn({ method: "POST" })
  .validator((d: { token?: string; stand?: boolean; offer?: "p27" }) =>
    z
      .object({
        token: z.string().optional(),
        stand: z.boolean().optional(),
        offer: z.literal("p27").optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    if (!stripeReady()) return { ok: false as const, error: "Payments are not open yet." };
    const token = cleanToken(data.token);
    let business = "";
    let email = "";
    if (token) {
      const r = await serviceRead<{ name: string | null; email: string | null }[]>(
        `prospects?select=name,email&report_token=eq.${token}`,
        "",
      );
      business = String(r.data?.[0]?.name ?? "").slice(0, 120);
      const e = String(r.data?.[0]?.email ?? "").trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) email = e;
    }
    // Optional add-on: one printed A5 table stand, sold at the shop price and
    // fulfilled through the normal shop order (see shopPaid in the webhook).
    const p27 = data.offer === "p27";
    const stand = data.stand && !p27 ? findStandPack("stand-1") : null;
    let orderId = "";
    if (stand) {
      const ins = await serviceWrite<{ id: string }[]>("shop_orders", "", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: {
          items: [{ kind: "stand", pack: stand.id, qty: stand.qty, pence: stand.pence }],
          total_pence: stand.pence,
          business_name: business || "Fix-It customer",
        },
      });
      orderId = ins.data?.[0]?.id ?? "";
      if (!orderId) return { ok: false as const, error: "Could not start your order. Try again." };
    }
    const meta = {
      kind: "fixit",
      token: token ?? "",
      business,
      ...(p27 ? { offer: "p27" } : {}),
      ...(orderId ? { order_id: orderId } : {}),
    };
    const s = await stripe<{ id: string; url: string }>("checkout/sessions", {
      mode: "payment",
      ...(token ? { client_reference_id: token } : {}),
      ...(email ? { customer_email: email } : {}),
      metadata: meta,
      // The £27 pack saves the card so the next page can offer a one-tap add-on
      // (https://docs.stripe.com/payments/save-during-payment).
      ...(p27 ? { customer_creation: "always" } : {}),
      payment_intent_data: {
        metadata: meta,
        ...(p27 ? { setup_future_usage: "off_session" } : {}),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: p27 ? PACK27_PENCE : FIXIT_PENCE,
            product_data: {
              name: p27 ? "Google Profile Fix Pack" : "Google Fix-It Pack",
              description: business
                ? `Done-for-you Google profile fixes for ${business}. Delivered in minutes.`
                : "Done-for-you Google profile fixes. Delivered in minutes.",
            },
          },
        },
        ...(stand
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "gbp",
                  unit_amount: stand.pence,
                  product_data: {
                    name: "A5 table stand with QR code",
                    description: "Printed for your business. Customers scan it to leave a review.",
                  },
                },
              },
            ]
          : []),
      ],
      ...(stand
        ? {
            shipping_address_collection: { allowed_countries: ["GB"] },
            shipping_options: [
              {
                shipping_rate_data: {
                  display_name: "Free UK delivery",
                  type: "fixed_amount",
                  fixed_amount: { amount: 0, currency: "gbp" },
                },
              },
            ],
          }
        : {}),
      phone_number_collection: { enabled: true },
      ...(p27
        ? {
            custom_text: {
              submit: {
                message:
                  "After paying, stay on the next page. There is one quick step to finish your order.",
              },
            },
          }
        : {}),
      allow_promotion_codes: true,
      success_url: `${ORIGIN}/fix/thanks?s={CHECKOUT_SESSION_ID}${p27 ? "&o=p27" : ""}${token ? `&r=${token}` : ""}`,
      cancel_url: p27 ? `${ORIGIN}/profile` : `${ORIGIN}/fix${token ? `?r=${token}` : ""}`,
    });
    if (!s.ok) return { ok: false as const, error: s.error };
    return { ok: true as const, url: s.data.url };
  });

// Stripe Checkout ids, or our Paystack references ("ps_...", Nigeria).
const SESSION_RE = /^(cs_(live|test)_[A-Za-z0-9]{10,200}|ps_[A-Za-z0-9]{16,64})$/;

/** Order not saved yet (webhook still on its way): ask the payment provider. */
async function recordFromProvider(s: string) {
  if (s.startsWith("ps_")) {
    const { paystack, ngPaystackPaid } = await import("./paystack.server");
    const v = await paystack<any>(`transaction/verify/${encodeURIComponent(s)}`).catch(() => null);
    if (v?.ok) await ngPaystackPaid(v.data);
    return;
  }
  const { recordFixitOrder } = await import("./fixit-pack.server");
  const r = await stripe<any>(`checkout/sessions/${s}`, undefined, "GET").catch(() => null);
  if (r?.ok && r.data?.payment_status === "paid" && r.data?.metadata?.kind === "fixit")
    await recordFixitOrder(r.data);
}

/** The thank-you page asks this every few seconds; it also writes the pack. */
export const fixitProgress = createServerFn({ method: "POST" })
  .validator((d: { s: string; go?: boolean }) =>
    z.object({ s: z.string().regex(SESSION_RE), go: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    const { orderBySession, processFixit, findReport } = await import("./fixit-pack.server");
    let o = await orderBySession(data.s);
    if (!o) {
      // The webhook may not have landed yet: check with the provider directly.
      await recordFromProvider(data.s);
      o = await orderBySession(data.s);
    }
    if (!o) return { status: "waiting" as const };
    // First visit: ask the optional questions (and the business, if unknown).
    if (!data.go && o.status === "paid") {
      const known = await findReport(o);
      return {
        status: "details" as const,
        needsBusiness: !known,
        business: known?.report.business.name ?? o.business ?? null,
      };
    }
    if (o.status === "needs_info")
      return { status: "details" as const, needsBusiness: true, business: null };
    if (o.status === "paid" || o.status === "writing") o = await processFixit(o);
    return o.status === "ready"
      ? { status: "ready" as const, key: o.view_key }
      : {
          status:
            o.status === "needs_info" || o.status === "failed"
              ? ("help" as const)
              : ("writing" as const),
        };
  });

export const getFixitPack = createServerFn({ method: "GET" })
  .validator((d: { key: string }) => z.object({ key: z.string().regex(/^[a-f0-9]{36}$/) }).parse(d))
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    const { orderByKey } = await import("./fixit-pack.server");
    const o = await orderByKey(data.key);
    return o?.status === "ready" && o.pack ? { business: o.business, pack: o.pack } : null;
  });

export const fixitDetails = createServerFn({ method: "POST" })
  .validator(
    (d: {
      s: string;
      areas?: string;
      services?: string;
      different?: string;
      placeId?: string;
      keyword?: string;
    }) =>
      z
        .object({
          s: z.string().regex(SESSION_RE),
          areas: z.string().trim().max(300).optional(),
          services: z.string().trim().max(500).optional(),
          different: z.string().trim().max(500).optional(),
          placeId: z
            .string()
            .regex(/^[A-Za-z0-9_-]{10,300}$/)
            .optional(),
          keyword: z.string().trim().max(60).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    const { orderBySession, saveFixitDetails } = await import("./fixit-pack.server");
    const o = await orderBySession(data.s);
    if (!o)
      return {
        ok: false as const,
        error: "We could not find your order yet. Try again in a moment.",
      };
    const extras = {
      ...(data.areas ? { areas: data.areas } : {}),
      ...(data.services ? { services: data.services } : {}),
      ...(data.different ? { different: data.different } : {}),
    };
    const r = await saveFixitDetails(o, {
      extras,
      ...(data.placeId ? { placeId: data.placeId } : {}),
      ...(data.keyword ? { keyword: data.keyword } : {}),
    });
    return r.ok
      ? { ok: true as const }
      : { ok: false as const, error: r.error ?? "Please try again." };
  });

// ---- £27 funnel: the steps after payment ----------------------------------

/** Where the buyer is in the after-payment steps. */
export const funnelState = createServerFn({ method: "POST" })
  .validator((d: { s: string }) => z.object({ s: z.string().regex(SESSION_RE) }).parse(d))
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    const { orderBySession } = await import("./fixit-pack.server");
    let o = await orderBySession(data.s);
    if (!o) {
      await recordFromProvider(data.s);
      o = await orderBySession(data.s);
    }
    if (!o) return { status: "waiting" as const };
    if (o.offer !== "p27") return { status: "done" as const };
    if (!o.upsell) return { status: "upsell" as const, business: o.business };
    if (o.upsell === "paid" && !o.plan) return { status: "plan" as const, business: o.business };
    return { status: "done" as const, upsell: o.upsell, plan: o.plan ?? null };
  });

/** One tap: charge £22 to the card saved at checkout, or note a no. */
export const funnelUpsell = createServerFn({ method: "POST" })
  .validator((d: { s: string; accept: boolean }) =>
    z.object({ s: z.string().regex(SESSION_RE), accept: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    const { orderBySession } = await import("./fixit-pack.server");
    const { chargeInstall } = await import("./fixit-funnel.server");
    const o = await orderBySession(data.s);
    if (!o || o.offer !== "p27") return { ok: false as const, error: "Order not found." };
    return chargeInstall(o, data.accept);
  });

/** After the free month: managed monthly, Growth yearly, or decide later. */
export const funnelPlan = createServerFn({ method: "POST" })
  .validator((d: { s: string; plan: "managed" | "growth_year" | "later" }) =>
    z
      .object({
        s: z.string().regex(SESSION_RE),
        plan: z.enum(["managed", "growth_year", "later"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    const { orderBySession } = await import("./fixit-pack.server");
    const { choosePlan } = await import("./fixit-funnel.server");
    const o = await orderBySession(data.s);
    if (!o || o.offer !== "p27" || o.upsell !== "paid")
      return { ok: false as const, error: "Order not found." };
    return choosePlan(o, data.plan);
  });
