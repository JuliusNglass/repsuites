// £1 review trial: one tap to Stripe. The sales page (video, questions) lives
// on growth.accelur8clientwork.com/reviews; this page just confirms the deal.
// No em dashes (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { Logo } from "../components/site/Logo";
import { trialStart } from "../lib/review-trial.functions";
import { TRIAL_DATA_PROMISE, TRIAL_TERMS } from "../lib/review-trial";

export const Route = createFileRoute("/try/")({
  validateSearch: z.object({ r: z.string().max(64).optional() }),
  head: () => ({ meta: [{ title: "Start for £1 | RepSuites" }] }),
  component: TryPage,
});

const STEPS = [
  "Pay £1 for your first 30 days",
  "Add the customer you just finished a job for",
  "Read the ready-written request and tap Send",
];

function TryPage() {
  const { r } = Route.useSearch();
  const start = useServerFn(trialStart);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    const res = await start({ data: r ? { r } : {} }).catch(() => null);
    if (res?.ok) {
      window.location.href = res.url;
      return;
    }
    setBusy(false);
    setErr(res && !res.ok ? res.error : "Something went wrong. Please try again.");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col text-base leading-relaxed">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Logo />
        </div>
      </header>
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-12 sm:py-16 space-y-8">
        <section className="space-y-4">
          <p className="eyebrow">Start for £1</p>
          <h1 className="text-3xl sm:text-4xl font-semibold">
            Ask every happy customer for a review, in your name.
          </h1>
          <ol className="card space-y-3 p-5 sm:p-6">
            {STEPS.map((t, i) => (
              <li key={t} className="flex items-start gap-3">
                <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gold-soft font-semibold">
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={busy}
            onClick={() => void go()}
            className="btn btn-gold btn-lg w-full"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            {busy ? "Opening secure payment" : "Pay £1 and start"}
          </button>
          <p className="rounded-lg border border-border bg-gold-soft p-3 font-semibold">
            Paying is step 1 of 3. After you pay, you come straight back here to add your customer.
            Please keep the page open until you see "Request sent".
          </p>
          {err && (
            <p role="alert" className="font-semibold text-destructive">
              {err}
            </p>
          )}
          <p className="text-muted-foreground">{TRIAL_TERMS}</p>
        </section>
        <section className="card p-5 sm:p-6 space-y-2">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5 text-success" aria-hidden /> Your customers stay yours
          </p>
          <p className="text-muted-foreground">{TRIAL_DATA_PROMISE}</p>
          <ul className="space-y-1 pt-1">
            {["No call to book", "Nothing to set up on Google", "Cancel any time"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
