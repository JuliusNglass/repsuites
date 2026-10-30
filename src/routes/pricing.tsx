// Plans and prices. Signed-in owners subscribe through Stripe Checkout; new
// visitors start with the free visibility check.
// No em dashes in this copy (AGENTS.md).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PublicLayout } from "../components/site/PublicLayout";
import { getSessionInfo } from "../lib/auth.functions";
import { openBillingPortal, startPlanCheckout } from "../lib/shop.functions";
import { money, perDay, PLAN_OFFERS, type PaidPlan } from "../lib/shop";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Plans and prices | RepSuites" },
      {
        name: "description",
        content:
          "RepSuites plans for local businesses: more reviews, replies to every review, and a climb into the top 3 on Google Maps. From £49 a month, cancel any time.",
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
  const [busy, setBusy] = useState<PaidPlan | null>(null);

  useEffect(() => {
    session()
      .then((r) => setSignedIn(r.ok && !!r.tenantId))
      .catch(() => null);
  }, [session]);

  async function choose(plan: PaidPlan) {
    setBusy(plan);
    try {
      const r = await start({ data: { plan } });
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

  return (
    <PublicLayout>
      <section className="px-4 pt-14 pb-16 md:pt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Pay for results you can see
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Every plan is monthly. No contract, cancel any time from your dashboard.
            </p>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-5 items-stretch">
            {PLAN_OFFERS.map((p) => (
              <div
                key={p.id}
                className={`relative rounded-3xl border bg-card p-7 flex flex-col ${p.popular ? "border-primary ring-2 ring-primary/40 md:-translate-y-2" : "border-border"}`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs font-bold px-3 py-1">
                    Most popular
                  </span>
                )}
                <h2 className="text-xl font-bold">{p.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{p.tagline}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold">{money(p.pence)}</span>
                  <span className="text-muted-foreground">a month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">About {perDay(p.pence)} a day</p>
                <ul className="mt-6 space-y-2.5 text-sm flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {signedIn ? (
                  <button
                    type="button"
                    onClick={() => choose(p.id)}
                    disabled={busy !== null}
                    className={`mt-7 rounded-xl font-bold py-3.5 flex items-center justify-center gap-2 disabled:opacity-60 ${p.popular ? "bg-primary text-primary-foreground" : "border border-border"}`}
                  >
                    {busy === p.id && <Loader2 className="w-4 h-4 animate-spin" />}
                    Choose {p.name}
                  </button>
                ) : (
                  <a
                    href="/#check"
                    className={`mt-7 rounded-xl font-bold py-3.5 text-center ${p.popular ? "bg-primary text-primary-foreground" : "border border-border"}`}
                  >
                    Start with a free check
                  </a>
                )}
              </div>
            ))}
          </div>

          <div className="mt-12 grid md:grid-cols-2 gap-5">
            <div className="rounded-2xl bg-muted/60 p-6">
              <h3 className="font-bold">How the maths works</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Pro is {money(9900)} a month. If an average customer spends £30 with you, then{" "}
                {money(9900)} divided by £30 is about 3.3, so 4 extra customers a month covers it.
                Everyone after that is profit.
              </p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-6">
              <h3 className="font-bold">Just want review cards?</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Cards and table stands are a one-off purchase and work without a plan.
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
