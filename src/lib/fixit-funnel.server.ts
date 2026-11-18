/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe JSON is checked field by field. */
// Server-only: the steps after a £27 Profile Fix Pack payment.
// 1. chargeInstall: one tap charges £22 to the card saved at checkout
//    (PaymentIntent with off_session + confirm, see
//    https://docs.stripe.com/payments/save-during-payment#charge-saved-payment-method).
//    If the bank asks for extra checks, we fall back to a £22 Checkout page.
// 2. choosePlan: a subscription that starts after the 30 free days
//    (trial_end, https://docs.stripe.com/api/subscriptions/create), on the
//    same saved card. Managed monthly or Growth yearly. Or "decide later".
// No em dashes in customer copy (AGENTS.md).
import { stripe } from "./stripe.server";
import { serviceWrite } from "./supabase-service.server";
import { sendEmail } from "./email.server";
import { FREE_MONTH_DAYS, INSTALL_PENCE } from "./fixit";
import { GROWTH, MANAGED } from "./shop";
import type { FixitOrder } from "./fixit-pack.server";

const ORIGIN = "https://repsuites.com";
type Res = { ok: true; url?: string } | { ok: false; error: string };

async function patch(id: string, body: Record<string, unknown>) {
  await serviceWrite(`fixit_orders?id=eq.${id}`, "", { method: "PATCH", body });
}

/** The card saved on the first payment. */
async function savedCard(o: FixitOrder): Promise<{ customer: string; pm: string } | null> {
  if (!o.payment_intent || !o.stripe_customer) return null;
  const pi = await stripe<any>(`payment_intents/${o.payment_intent}`);
  if (!pi.ok) return null;
  const pm = pi.data.payment_method;
  const id = typeof pm === "string" ? pm : pm?.id;
  return id ? { customer: o.stripe_customer, pm: id } : null;
}

async function tellTeam(subject: string, o: FixitOrder, line: string) {
  await sendEmail({
    to: "julius@accelur8.com",
    subject,
    html: `<p><b>${o.business ?? "A buyer"}</b> ${line}</p><p>Name: ${o.name ?? "-"}<br>Email: ${o.email ?? "-"}<br>Phone: ${o.phone ?? "-"}</p>`,
    text: `${o.business ?? "A buyer"} ${line}. ${o.email ?? ""} ${o.phone ?? ""}`,
  }).catch(() => null);
}

export async function chargeInstall(o: FixitOrder, accept: boolean): Promise<Res> {
  if (o.upsell === "paid") return { ok: true };
  if (!accept) {
    await patch(o.id, { upsell: "declined" });
    return { ok: true };
  }
  const meta = { kind: "fixit_install", fixit_order: o.id, business: o.business ?? "" };
  const card = await savedCard(o);
  if (card) {
    const pi = await stripe<any>(
      "payment_intents",
      {
        amount: INSTALL_PENCE,
        currency: "gbp",
        customer: card.customer,
        payment_method: card.pm,
        off_session: true,
        confirm: true,
        description: "We put your Google fixes in for you + first month managed free",
        metadata: meta,
      },
      "POST",
      { idempotencyKey: `fixit-install-${o.id}` },
    );
    if (pi.ok && pi.data.status === "succeeded") {
      await patch(o.id, { upsell: "paid", upsell_pi: pi.data.id });
      await tellTeam(
        "Install add-on bought (£22)",
        o,
        "added the £22 install + free managed month. Get manager access and put the pack in.",
      );
      return { ok: true };
    }
  }
  // No saved card, or the bank wants a check: send them to a £22 card page.
  const s = await stripe<{ url: string }>("checkout/sessions", {
    mode: "payment",
    ...(o.stripe_customer ? { customer: o.stripe_customer } : {}),
    metadata: meta,
    payment_intent_data: { metadata: meta },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: INSTALL_PENCE,
          product_data: {
            name: "We put it in for you",
            description: "Your Google fixes added for you, plus your first month managed free.",
          },
        },
      },
    ],
    success_url: `${ORIGIN}/fix/thanks?s=${o.stripe_session_id}&o=p27&i=1`,
    cancel_url: `${ORIGIN}/fix/thanks?s=${o.stripe_session_id}&o=p27`,
  });
  if (!s.ok) {
    await patch(o.id, { upsell: "failed" });
    return { ok: false, error: "That did not go through. Your pack is still on its way." };
  }
  return { ok: true, url: s.data.url };
}

/** From the webhook: the £22 fallback card page was paid. */
export async function installPaidFromSession(session: any) {
  const id = String(session?.metadata?.fixit_order ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await patch(id, {
    upsell: "paid",
    upsell_pi: typeof session.payment_intent === "string" ? session.payment_intent : null,
  });
}

export async function choosePlan(
  o: FixitOrder,
  plan: "managed" | "growth_year" | "later",
): Promise<Res> {
  if (o.plan && o.plan !== "later") return { ok: true };
  if (plan === "later") {
    await patch(o.id, { plan: "later" });
    return { ok: true };
  }
  const card = await savedCard(o);
  if (!card)
    return { ok: false, error: "We could not find your card. We will message you to set this up." };
  const { ensureProduct, TRIAL_PRODUCTS } = await import("./trial.server");
  const key = plan === "managed" ? "managed" : "gold";
  await ensureProduct(key);
  const trialEnd = Math.floor(Date.now() / 1000) + FREE_MONTH_DAYS * 86400;
  const sub = await stripe<any>(
    "subscriptions",
    {
      customer: card.customer,
      items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            product: TRIAL_PRODUCTS[key].id,
            unit_amount: plan === "managed" ? MANAGED.monthPence : GROWTH.yearPence,
            recurring: { interval: plan === "managed" ? "month" : "year" },
          },
        },
      ],
      default_payment_method: card.pm,
      trial_end: trialEnd,
      metadata: { kind: "funnel_plan", product: "repsuites", fixit_order: o.id, plan },
    },
    "POST",
    { idempotencyKey: `fixit-plan-${o.id}-${plan}` },
  );
  if (!sub.ok)
    return { ok: false, error: "That did not go through. We will message you to sort it." };
  await patch(o.id, { plan, plan_sub: sub.data.id });
  await tellTeam(
    plan === "managed"
      ? "Managed plan chosen (£99/mo after free month)"
      : "Growth yearly chosen (£497/yr after free month)",
    o,
    `chose ${plan === "managed" ? "Managed £99/month" : "Growth yearly £497"}, starting after 30 free days. Set up their RepSuites account.`,
  );
  return { ok: true };
}
