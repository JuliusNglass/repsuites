// The £1 review trial: thin server functions for /try and /try/next.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { applyNoStoreHeaders, verifyRequestOriginAsync } from "./auth.server";
import { stripeReady } from "./stripe.server";
import { cleanToken } from "./fixit";
import { TRIAL_SESSION_RE, trialCustomerProblem } from "./review-trial";

export const trialStart = createServerFn({ method: "POST" })
  .validator((d: { r?: string }) => z.object({ r: z.string().max(64).optional() }).parse(d))
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    if (!stripeReady()) return { ok: false as const, error: "Payments are not open yet." };
    const { knownBusiness, startReviewTrial } = await import("./review-trial.server");
    const token = cleanToken(data.r) ?? "";
    const known = await knownBusiness(token);
    let email = "";
    if (token) {
      const { serviceRead } = await import("./supabase-service.server");
      const p = await serviceRead<{ email: string | null }[]>(
        `prospects?select=email&report_token=eq.${token}&limit=1`,
        "",
      );
      const e = String(p.data?.[0]?.email ?? "").trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) email = e;
    }
    return startReviewTrial({ token, business: known?.name ?? "", email });
  });

export const trialState = createServerFn({ method: "POST" })
  .validator((d: { s: string }) => z.object({ s: z.string().regex(TRIAL_SESSION_RE) }).parse(d))
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    const { readTrialSession, knownBusiness } = await import("./review-trial.server");
    const s = await readTrialSession(data.s);
    if (!s) return { status: "missing" as const };
    if (!s.paid) return { status: "waiting" as const };
    const known = await knownBusiness(s.token);
    return {
      status: "ready" as const,
      business: known?.name ?? s.business ?? "",
      placeId: known?.placeId ?? "",
      ownerFirst: s.name.split(/\s+/)[0] ?? "",
    };
  });

export const trialFinish = createServerFn({ method: "POST" })
  .validator(
    (d: {
      s: string;
      business: string;
      placeId?: string;
      name: string;
      phone: string;
      email: string;
      agree: boolean;
    }) =>
      z
        .object({
          s: z.string().regex(TRIAL_SESSION_RE),
          business: z.string().trim().min(2).max(120),
          placeId: z
            .string()
            .regex(/^[A-Za-z0-9_-]{10,300}$/)
            .optional(),
          name: z.string().trim().max(80),
          phone: z.string().trim().max(30),
          email: z.string().trim().max(200),
          agree: z.boolean(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    if (!data.agree)
      return {
        ok: false as const,
        error: "Tick the box to confirm you can contact this customer.",
      };
    const person = { name: data.name, phone: data.phone, email: data.email };
    const problem = trialCustomerProblem(person);
    if (problem) return { ok: false as const, error: problem };
    const { readTrialSession, finishReviewTrial } = await import("./review-trial.server");
    const s = await readTrialSession(data.s);
    if (!s) return { ok: false as const, error: "We couldn't find your payment." };
    return finishReviewTrial(s, { name: data.business, placeId: data.placeId ?? "" }, person);
  });
