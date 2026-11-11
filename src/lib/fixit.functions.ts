// Fix-It Pack checkout (Stripe Checkout, one-off payment). Public: anyone
// with the sales page can buy. The report token, when present, links the
// payment back to the report so we know which business to fix.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { applyNoStoreHeaders, verifyRequestOriginAsync } from "./auth.server";
import { serviceRead } from "./supabase-service.server";
import { stripe, stripeReady } from "./stripe.server";
import { cleanToken, FIXIT_PENCE } from "./fixit";

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
  .validator((d: { token?: string }) => z.object({ token: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    if (!stripeReady()) return { ok: false as const, error: "Payments are not open yet." };
    const token = cleanToken(data.token);
    let business = "";
    if (token) {
      const r = await serviceRead<{ name: string | null }[]>(
        `prospects?select=name&report_token=eq.${token}`,
        "",
      );
      business = String(r.data?.[0]?.name ?? "").slice(0, 120);
    }
    const meta = { kind: "fixit", token: token ?? "", business };
    const s = await stripe<{ id: string; url: string }>("checkout/sessions", {
      mode: "payment",
      ...(token ? { client_reference_id: token } : {}),
      metadata: meta,
      payment_intent_data: { metadata: meta },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: FIXIT_PENCE,
            product_data: {
              name: "Google Fix-It Pack",
              description: business
                ? `Done-for-you Google profile fixes for ${business}. Delivered within 48 hours.`
                : "Done-for-you Google profile fixes. Delivered within 48 hours.",
            },
          },
        },
      ],
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${ORIGIN}/fix/thanks${token ? `?r=${token}` : ""}`,
      cancel_url: `${ORIGIN}/fix${token ? `?r=${token}` : ""}`,
    });
    if (!s.ok) return { ok: false as const, error: s.error };
    return { ok: true as const, url: s.data.url };
  });
