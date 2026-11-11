// Fix-It Pack sales page (/fix, or /fix?r=<report token>). One offer, one
// button, straight to Stripe Checkout. No menu. No em dashes (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { Check, Clock, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "../components/site/Logo";
import { fixitBusiness, startFixitCheckout } from "../lib/fixit.functions";
import { FIXIT_FAQ, FIXIT_INCLUDES, FIXIT_PRICE } from "../lib/fixit";

export const Route = createFileRoute("/fix")({
  validateSearch: z.object({ r: z.string().optional() }),
  loaderDeps: ({ search }) => ({ r: search.r }),
  loader: ({ deps }) => fixitBusiness({ data: deps.r ? { token: deps.r } : {} }),
  head: () => ({
    meta: [
      { title: "Google Fix-It Pack | RepSuites" },
      {
        name: "description",
        content:
          "We write your Google profile fixes for you. One-off £27, delivered within 48 hours.",
      },
    ],
  }),
  component: FixPage,
});

function BuyButton({ token }: { token?: string | undefined }) {
  const start = useServerFn(startFixitCheckout);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    const r = await start({ data: token ? { token } : {} }).catch(() => null);
    if (r?.ok) {
      window.location.href = r.url;
      return;
    }
    setErr(r && !r.ok ? r.error : "Something went wrong. Please try again.");
    setBusy(false);
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="w-full min-h-14 rounded-full bg-primary px-6 text-lg font-bold text-primary-foreground shadow-md transition active:scale-[.98] disabled:opacity-70 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2"
      >
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Opening secure checkout
          </span>
        ) : (
          `Fix my Google profile for ${FIXIT_PRICE}`
        )}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="h-4 w-4" aria-hidden /> Secure payment by Stripe. One-off, no subscription.
      </p>
      {err ? (
        <p role="alert" className="text-center text-base text-destructive">
          {err}
        </p>
      ) : null}
    </div>
  );
}

function FixPage() {
  const { r } = Route.useSearch();
  const { name } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col text-base leading-relaxed">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Logo />
        </div>
      </header>
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-8 sm:py-12 space-y-10">
        <section aria-labelledby="h1" className="space-y-4">
          <p className="font-semibold text-primary">Google Fix-It Pack</p>
          <h1 id="h1" className="text-3xl sm:text-4xl font-bold leading-tight">
            {name ? `We write the fixes for ${name}. ` : "We write your Google fixes for you. "}
            You just copy them in.
          </h1>
          <p className="text-lg text-muted-foreground">
            Your free check showed the gaps. Most owners never get round to fixing them. For a
            one-off {FIXIT_PRICE}, we write every fix for you, ready to paste, within 48 hours.
          </p>
          <BuyButton token={r} />
        </section>

        <section
          aria-labelledby="inc"
          className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4"
        >
          <h2 id="inc" className="text-xl font-bold">
            What you get
          </h2>
          <ul className="space-y-3">
            {FIXIT_INCLUDES.map((x) => (
              <li key={x} className="flex gap-3">
                <Check className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span>{x}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how" className="space-y-4">
          <h2 id="how" className="text-xl font-bold">
            How it works
          </h2>
          <ol className="space-y-3">
            {[
              "Pay once, securely. It takes under a minute.",
              "We use your free check to write every fix for your business.",
              "Within 48 hours you get it all by email and WhatsApp, in the order to do it.",
            ].map((x, i) => (
              <li key={x} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span>{x}</span>
              </li>
            ))}
          </ol>
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="flex gap-2 rounded-xl bg-muted p-4">
              <Clock className="h-5 w-5 shrink-0 text-primary" aria-hidden /> Done within 48 hours
            </p>
            <p className="flex gap-2 rounded-xl bg-muted p-4">
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden /> 14-day
              money-back promise
            </p>
          </div>
        </section>

        <section aria-labelledby="faq" className="space-y-3">
          <h2 id="faq" className="text-xl font-bold">
            Questions
          </h2>
          {FIXIT_FAQ.map(([q, a]) => (
            <details key={q} className="rounded-xl border border-border p-4">
              <summary className="cursor-pointer font-semibold">{q}</summary>
              <p className="mt-2 text-muted-foreground">{a}</p>
            </details>
          ))}
        </section>

        <section className="space-y-3">
          <BuyButton token={r} />
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        RepSuites by Accelur8
      </footer>
    </div>
  );
}
