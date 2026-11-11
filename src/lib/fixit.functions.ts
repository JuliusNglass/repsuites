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
                ? `Done-for-you Google profile fixes for ${business}. Delivered in minutes.`
                : "Done-for-you Google profile fixes. Delivered in minutes.",
            },
          },
        },
      ],
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${ORIGIN}/fix/thanks?s={CHECKOUT_SESSION_ID}${token ? `&r=${token}` : ""}`,
      cancel_url: `${ORIGIN}/fix${token ? `?r=${token}` : ""}`,
    });
    if (!s.ok) return { ok: false as const, error: s.error };
    return { ok: true as const, url: s.data.url };
  });

const SESSION_RE = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;

/** The thank-you page asks this every few seconds; it also writes the pack. */
export const fixitProgress = createServerFn({ method: "POST" })
  .validator((d: { s: string; go?: boolean }) =>
    z.object({ s: z.string().regex(SESSION_RE), go: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    const { orderBySession, processFixit, recordFixitOrder, findReport } =
      await import("./fixit-pack.server");
    let o = await orderBySession(data.s);
    if (!o) {
      // The webhook may not have landed yet: check with Stripe directly.
      const s = await stripe<any>(`checkout/sessions/${data.s}`, undefined, "GET").catch(
        () => null,
      );
      if (s?.ok && s.data?.payment_status === "paid" && s.data?.metadata?.kind === "fixit") {
        await recordFixitOrder(s.data);
        o = await orderBySession(data.s);
      }
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
