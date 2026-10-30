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
import {
  FREE_FEATURES,
  GROWTH,
  money,
  perDay,
  planPence,
  yearSaving,
  type BillingInterval,
} from "../lib/shop";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Prices | RepSuites" },
      {
        name: "description",
        content:
          "Start free with your own review page and QR code. Upgrade to RepSuites Growth for £49 a month, or £497 a year. Cancel any time.",
      },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const session = useServerFn(getSessionInfo);
  const start = useServerFn(startPlanCheckout);
  const portal = useServerFn(openBillingPortal);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("month");

  useEffect(() => {
    session()
      .then((r) => setSignedIn(r.ok && !!r.tenantId))
      .catch(() => null);
  }, [session]);

  async function upgrade() {
    if (!signedIn) return void (window.location.href = "/start");
    setBusy(true);
    try {
      const r = await start({ data: { plan: "gold", interval } });
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
    setBusy(false);
  }

  const yearly = interval === "year";

  return (
    <PublicLayout>
      <section className="px-4 pt-14 pb-16 md:pt-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Start free. Grow when you are ready.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              No contract. Cancel any time from your dashboard.
            </p>
            <div className="mt-8 inline-flex rounded-full border border-border bg-card p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setInterval("month")}
                className={`rounded-full px-5 py-2 ${!yearly ? "bg-foreground text-background" : ""}`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setInterval("year")}
                className={`rounded-full px-5 py-2 ${yearly ? "bg-foreground text-background" : ""}`}
              >
                Yearly{" "}
                <span className={yearly ? "text-primary" : "text-emerald-600"}>2 months free</span>
              </button>
            </div>
          </div>

          <div className="mt-10 grid md:grid-cols-2 gap-5 items-stretch">
            <div className="rounded-3xl border border-border bg-card p-7 flex flex-col">
              <h2 className="text-xl font-bold">Free</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Start getting more reviews today.
              </p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold">£0</span>
                <span className="text-muted-foreground">for ever</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">No card needed</p>
              <ul className="mt-6 space-y-2.5 text-sm flex-1">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={signedIn ? "/dashboard" : "/start"}
                className="mt-7 rounded-xl border border-border font-bold py-3.5 text-center"
              >
                {signedIn ? "Go to my dashboard" : "Start free"}
              </a>
            </div>

            <div className="relative rounded-3xl border border-primary ring-2 ring-primary/40 bg-card p-7 flex flex-col md:-translate-y-2">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs font-bold px-3 py-1">
                Best value
              </span>
              <h2 className="text-xl font-bold">{GROWTH.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">{GROWTH.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold">{money(planPence(interval))}</span>
                <span className="text-muted-foreground">{yearly ? "a year" : "a month"}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {yearly
                  ? `That is ${money(Math.round(GROWTH.yearPence / 12))} a month. You save ${money(yearSaving())}.`
                  : `About ${perDay(GROWTH.monthPence)} a day`}
              </p>
              <ul className="mt-6 space-y-2.5 text-sm flex-1">
                <li className="flex gap-2.5 font-semibold">
                  <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                  <span>Everything in Free, plus:</span>
                </li>
                {GROWTH.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={upgrade}
                disabled={busy}
                className="mt-7 rounded-xl bg-primary text-primary-foreground font-bold py-3.5 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {signedIn ? "Upgrade to Growth" : "Start free, upgrade any time"}
              </button>
            </div>
          </div>

          <div className="mt-12 grid md:grid-cols-2 gap-5">
            <div className="rounded-2xl bg-muted/60 p-6">
              <h3 className="font-bold">How the maths works</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Growth is {money(GROWTH.monthPence)} a month. If a customer spends £20 with you, 3
                extra customers a month pays for it. Everyone after that is profit.
              </p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-6">
              <h3 className="font-bold">Just want review cards?</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Cards and table stands are a one-off buy and work without a plan.
              </p>
              <Link
                to="/cards"
                className="mt-3 inline-block font-semibold underline underline-offset-2"
              >
                See review cards
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
