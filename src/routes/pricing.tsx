// Prices: Free, or RepSuites Growth monthly or yearly. Signed-in owners
// subscribe through Stripe Checkout; new visitors start free first.
// No em dashes in this copy (AGENTS.md).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PublicLayout } from "../components/site/PublicLayout";
import { getSessionInfo } from "../lib/auth.functions";
import { openBillingPortal, startPlanCheckout } from "../lib/shop.functions";
import { getPopularPlan } from "../lib/popular-plan.functions";
import {
  FREE_FEATURES,
  GROWTH,
  MANAGED,
  money,
  perDay,
  planPence,
  TRIAL_TERMS,
  yearSaving,
  type BillingInterval,
  type CheckoutPlan,
} from "../lib/shop";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Prices | RepSuites" },
      {
        name: "description",
        content:
          "Start free with your own review page and QR code. Upgrade to RepSuites Growth for £49 a month with a 14-day free trial, or £497 a year. No setup fee. Cancel any time.",
      },
    ],
  }),
  // "Most popular" only when real subscriptions say so (popular-plan.ts).
  loader: async () => getPopularPlan().catch(() => ({ planId: null })),
  component: Pricing,
});

function PopularBadge() {
  return (
    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary text-primary-foreground text-sm font-bold px-3.5 py-1 shadow-[var(--shadow-gold)]">
      Most popular
    </span>
  );
}

function Pricing() {
  const { planId: popular } = Route.useLoaderData();
  const session = useServerFn(getSessionInfo);
  const start = useServerFn(startPlanCheckout);
  const portal = useServerFn(openBillingPortal);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState<CheckoutPlan | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("year");

  useEffect(() => {
    session()
      .then((r) => setSignedIn(r.ok && !!r.tenantId))
      .catch(() => null);
  }, [session]);

  async function upgrade(plan: CheckoutPlan) {
    if (!signedIn) return void (window.location.href = "/start");
    setBusy(plan);
    try {
      const r = await start({ data: { plan, interval } });
      if (r.ok) return void (window.location.href = r.url);
      if (r.error === "manage") {
        const p = await portal();
        if (p.ok) return void (window.location.href = p.url);
        toast.error(p.error);
      } else if (r.error === "signin") window.location.href = "/login";
      else toast.error(r.error);
    } catch {
      toast.error("Something went wrong. Try again.");
    }
    setBusy(null);
  }

  const yearly = interval === "year";

  return (
    <PublicLayout>
      <section
        aria-labelledby="price-h1"
        className="px-4 pt-12 pb-16 md:pt-20 md:pb-24 bg-[radial-gradient(80%_40%_at_50%_0%,var(--gold-soft),transparent_70%)]"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <p className="eyebrow">Prices</p>
            <h1
              id="price-h1"
              className="mt-3 text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold leading-[1.08]"
            >
              Start free. <span className="italic text-primary-ink">Grow when you are ready.</span>
            </h1>
            <p className="mt-4 text-lg sm:text-xl text-muted-foreground">
              No contract. No setup fee. Cancel any time from your dashboard.
            </p>
            <div
              role="group"
              aria-label="Billing period"
              className="mt-8 inline-flex rounded-full border border-border bg-card p-1 text-base font-semibold shadow-[var(--shadow-xs)]"
            >
              <button
                type="button"
                onClick={() => setInterval("month")}
                aria-pressed={!yearly}
                className={`rounded-full px-5 py-2 min-h-11 transition-colors ${!yearly ? "bg-navy text-white" : "hover:bg-secondary"}`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setInterval("year")}
                aria-pressed={yearly}
                className={`rounded-full px-5 py-2 min-h-11 transition-colors ${yearly ? "bg-navy text-white" : "hover:bg-secondary"}`}
              >
                Yearly{" "}
                <span className={yearly ? "text-primary" : "text-success"}>£91 off a year</span>
              </button>
            </div>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-5 items-stretch">
            <div className="card rounded-3xl p-6 sm:p-7 flex flex-col">
              <h2 className="text-xl font-semibold">Free</h2>
              <p className="text-base text-muted-foreground mt-1">
                Start getting more reviews today.
              </p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-5xl font-semibold tabular-nums">£0</span>
                <span className="text-muted-foreground">for ever</span>
              </div>
              <p className="text-base text-muted-foreground mt-1">No card needed</p>
              <ul className="mt-6 space-y-2.5 text-base flex-1">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="w-5 h-5 mt-0.5 shrink-0 text-primary-ink" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={signedIn ? "/dashboard" : "/start"}
                className="mt-7 btn btn-ghost btn-lg w-full"
              >
                {signedIn ? "Go to my dashboard" : "Start free"}
              </a>
            </div>

            <div className="surface-navy relative rounded-3xl p-6 sm:p-7 flex flex-col shadow-[var(--shadow-lift)] ring-1 ring-primary/50 md:-translate-y-3">
              {popular === GROWTH.id && <PopularBadge />}
              <h2 className="text-xl font-semibold text-white">{GROWTH.name}</h2>
              <p className="text-base text-white/85 mt-1">{GROWTH.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-5xl font-semibold tabular-nums text-white">
                  {money(planPence(interval))}
                </span>
                <span className="text-white/85">{yearly ? "a year" : "a month"}</span>
              </div>
              <p className="text-base text-white/85 mt-1">
                {yearly
                  ? `That is ${money(Math.round(GROWTH.yearPence / 12))} a month. You save ${money(yearSaving())}.`
                  : `About ${perDay(GROWTH.monthPence)} a day`}
              </p>
              {!yearly && (
                <p className="text-base font-semibold mt-2 text-primary">{TRIAL_TERMS}</p>
              )}
              <ul className="mt-6 space-y-2.5 text-base flex-1 text-white/90">
                <li className="flex gap-2.5 font-semibold text-white">
                  <Check className="w-5 h-5 mt-0.5 shrink-0 text-primary" aria-hidden />
                  <span>Everything in Free, plus:</span>
                </li>
                {GROWTH.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="w-5 h-5 mt-0.5 shrink-0 text-primary" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void upgrade("gold")}
                disabled={busy !== null}
                className="mt-7 btn btn-gold btn-lg w-full"
              >
                {busy === "gold" && <Loader2 className="w-5 h-5 animate-spin" aria-hidden />}
                {signedIn
                  ? yearly
                    ? "Upgrade to Growth"
                    : "Start my 14-day free trial"
                  : "Start free, upgrade any time"}
              </button>
            </div>

            <div className="card relative rounded-3xl p-6 sm:p-7 flex flex-col">
              {popular === MANAGED.id && <PopularBadge />}
              <h2 className="text-xl font-semibold">We do it for you</h2>
              <p className="text-base text-muted-foreground mt-1">{MANAGED.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-5xl font-semibold tabular-nums">
                  {money(planPence(interval, "managed"))}
                </span>
                <span className="text-muted-foreground">{yearly ? "a year" : "a month"}</span>
              </div>
              <p className="text-base text-muted-foreground mt-1">
                {yearly
                  ? `That is ${money(Math.round(MANAGED.yearPence / 12))} a month. You save ${money(yearSaving("managed"))}.`
                  : `About ${perDay(MANAGED.monthPence)} a day`}
              </p>
              {!yearly && <p className="text-base font-semibold mt-2">{TRIAL_TERMS}</p>}
              <ul className="mt-6 space-y-2.5 text-base flex-1">
                {MANAGED.features.map((f, i) => (
                  <li key={f} className={`flex gap-2.5 ${i === 0 ? "font-semibold" : ""}`}>
                    <Check className="w-5 h-5 mt-0.5 shrink-0 text-primary-ink" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void upgrade("managed")}
                disabled={busy !== null}
                className="mt-7 btn btn-navy btn-lg w-full"
              >
                {busy === "managed" && <Loader2 className="w-5 h-5 animate-spin" aria-hidden />}
                {signedIn
                  ? yearly
                    ? "Let us run it"
                    : "Start my 14-day free trial"
                  : "Start free, then let us run it"}
              </button>
            </div>
          </div>

          <div className="mt-14 grid md:grid-cols-2 gap-5">
            <div className="rounded-3xl border border-border bg-secondary/60 p-6 sm:p-7">
              <p className="eyebrow">Worked example</p>
              <h3 className="mt-2 text-2xl font-semibold">How the maths works</h3>
              <p className="text-base text-muted-foreground mt-3">
                Growth is {money(GROWTH.monthPence)} a month. Say a customer spends £20 with you. 3
                extra customers a month is 3 x £20 = £60. That is more than the{" "}
                {money(GROWTH.monthPence)} you pay.
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-secondary/60 p-6 sm:p-7">
              <p className="eyebrow">One-off buy</p>
              <h3 className="mt-2 text-2xl font-semibold">Just want review cards?</h3>
              <p className="text-base text-muted-foreground mt-3">
                Cards and table stands are a one-off buy and work without a plan.
              </p>
              <Link to="/cards" className="mt-4 btn btn-ghost">
                See review cards
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
