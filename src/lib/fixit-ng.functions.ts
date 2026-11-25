// Nigeria Fix-it Pack checkout. Paystack first (cards incl. Verve, bank
// transfer, USSD); Stripe in NGN as a fallback for international cards.
// Both come back to /fix/thanks?s=<id>&o=ng, where the pack is written.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { applyNoStoreHeaders, verifyRequestOriginAsync } from "./auth.server";
import { stripe, stripeReady } from "./stripe.server";
import { ngAmountKobo, type NgPrice, type NgTier } from "./fixit-ng";

const ORIGIN = "https://repsuites.com";

export const startNgCheckout = createServerFn({ method: "POST" })
  .validator(
    (d: {
      price: NgPrice;
      tier: NgTier;
      provider: "paystack" | "stripe";
      email: string;
      phone: string;
      name?: string;
      business?: string;
    }) =>
      z
        .object({
          price: z.union([z.literal(10), z.literal(20)]),
          tier: z.enum(["diy", "dfy"]),
          provider: z.enum(["paystack", "stripe"]),
          email: z.string().trim().email().max(160),
          phone: z
            .string()
            .trim()
            .regex(/^\+?[0-9 ]{10,16}$/),
          name: z.string().trim().max(80).optional(),
          business: z.string().trim().max(120).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    const amount = ngAmountKobo(data.price, data.tier);
    const phone = normaliseNgPhone(data.phone);
    const { newPaystackRef, sendFixitNgEvent } = await import("./paystack.server");
    const ref = newPaystackRef();
    // Saved as a contact now, so anyone who does not finish paying is followed up.
    await sendFixitNgEvent({
      event: "started",
      tier: data.tier,
      price: data.price,
      name: data.name ?? "",
      phone,
      email: data.email.toLowerCase(),
      business: data.business ?? "",
      ref,
      amount_kobo: amount,
    });
    const label = data.tier === "dfy" ? "Google Fix-it Pack - Done for you" : "Google Fix-it Pack";

    if (data.provider === "paystack") {
      const { paystack, paystackReady } = await import("./paystack.server");
      if (!paystackReady()) return { ok: false as const, error: "Payments are not open yet." };
      const r = await paystack<{ authorization_url: string }>("transaction/initialize", {
        email: data.email.toLowerCase(),
        amount,
        currency: "NGN",
        reference: ref,
        callback_url: `${ORIGIN}/fix/thanks?s=${ref}&o=ng`,
        channels: ["card", "bank_transfer", "ussd", "bank"],
        metadata: {
          kind: "fixit_ng",
          tier: data.tier,
          price: data.price,
          amount_kobo: amount,
          phone,
          name: data.name ?? "",
          business: data.business ?? "",
          email: data.email.toLowerCase(),
        },
      });
      if (!r.ok) return { ok: false as const, error: r.error };
      return { ok: true as const, url: r.data.authorization_url };
    }

    if (!stripeReady()) return { ok: false as const, error: "Card payments are not open yet." };
    const meta = {
      kind: "fixit",
      token: "",
      business: data.business ?? "",
      offer: `ng_${data.tier}`,
    };
    const s = await stripe<{ url: string }>("checkout/sessions", {
      mode: "payment",
      customer_email: data.email.toLowerCase(),
      metadata: meta,
      payment_intent_data: { metadata: meta },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "ngn",
            unit_amount: amount,
            product_data: {
              name: label,
              description: "Delivered in minutes on WhatsApp and email.",
            },
          },
        },
      ],
      phone_number_collection: { enabled: true },
      success_url: `${ORIGIN}/fix/thanks?s={CHECKOUT_SESSION_ID}&o=ng`,
      cancel_url: `${ORIGIN}/ng?p=${data.price}`,
    });
    if (!s.ok) return { ok: false as const, error: s.error };
    return { ok: true as const, url: s.data.url };
  });

/** 0803 573 1148 -> +2348035731148. Leaves other countries as typed. */
export function normaliseNgPhone(p: string): string {
  const d = p.replace(/[^0-9+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.startsWith("234")) return `+${d}`;
  if (d.startsWith("0") && d.length === 11) return `+234${d.slice(1)}`;
  return d;
}
