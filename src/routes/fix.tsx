// Fix-It Pack sales page (/fix, or /fix?r=<report token>). One offer, one
// button, straight to Stripe Checkout. No menu. No em dashes (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Check, ChevronDown, Clock, Copy, Loader2, Lock, ShieldCheck } from "lucide-react";
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
        content: "We write your Google profile fixes for you. One-off £27, ready in minutes.",
      },
    ],
  }),
  component: FixPage,
});

function BuyButton({ token, compact = false }: { token?: string | undefined; compact?: boolean }) {
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
        className={`btn btn-gold w-full ${compact ? "min-h-12 text-base" : "btn-lg"}`}
      >
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Opening secure checkout
          </span>
        ) : (
          `Fix my Google profile for ${FIXIT_PRICE}`
        )}
      </button>
      {compact ? null : (
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden /> Secure payment by Stripe. One-off, no
          subscription.
        </p>
      )}
      {err ? (
        <p role="alert" className="text-center text-base text-destructive">
          {err}
        </p>
      ) : null}
    </div>
  );
}

// A styled preview of the delivered pack. Grey bars stand in for the
// business-specific text, so nothing here is invented.
function PackMock({ name }: { name?: string | null | undefined }) {
  const rows: [string, number[]][] = [
    ["Business description", [100, 92, 64]],
    ["Main category", [48]],
    ["Week 1 Google post", [96, 70]],
  ];
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-primary/25 via-transparent to-navy/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-lift)]">
        <div className="surface-navy px-5 py-4">
          <p className="text-sm font-bold uppercase tracking-[0.08em] text-primary">
            Google Fix-It Pack
          </p>
          <p className="mt-1 font-display text-xl font-semibold text-white">
            {name ? `Ready for ${name}` : "Your fixes are ready"}
          </p>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          {rows.map(([title, bars]) => (
            <div key={title} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">{title}</p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold">
                  <Copy className="h-3.5 w-3.5" /> Copy
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {bars.map((w, i) => (
                  <div key={i} className="h-2.5 rounded-full bg-muted" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-2xl bg-gold-soft px-4 py-3 text-sm font-semibold text-foreground">
            <Check className="h-4 w-4 text-primary-ink" /> Checklist: 6 fixes, in order
          </div>
        </div>
      </div>
    </div>
  );
}

function FixPage() {
  const { r } = Route.useSearch();
  const { name } = Route.useLoaderData();
  const heroBuy = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const el = heroBuy.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) =>
      setShowBar(!!e && !e.isIntersecting && e.boundingClientRect.top < 0),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col text-base leading-relaxed">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md backdrop-saturate-150">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Logo />
          <p className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" aria-hidden /> Secure checkout by Stripe
          </p>
        </div>
      </header>
      <main className="flex-1 w-full pb-28 md:pb-0">
        <section
          aria-labelledby="h1"
          className="relative overflow-hidden border-b border-border/70 bg-[radial-gradient(90%_70%_at_100%_0%,var(--gold-soft),transparent_60%)]"
        >
          <div className="max-w-6xl mx-auto px-4 py-10 sm:py-16 lg:py-20 grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            <div className="space-y-6 max-w-xl">
              <p className="eyebrow">
                <span className="h-px w-6 bg-primary-ink" aria-hidden /> Google Fix-It Pack
              </p>
              <h1
                id="h1"
                className="text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold leading-[1.08]"
              >
                {name ? `We write the fixes for ${name}. ` : "We write your Google fixes for you. "}
                <span className="italic text-primary-ink">You just copy them in.</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground">
                Your free check showed the gaps. Most owners never get round to fixing them. For a
                one-off {FIXIT_PRICE}, we write every fix for you, ready to paste, in minutes.
              </p>
              <div ref={heroBuy} className="max-w-md">
                <BuyButton token={r} />
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-base text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary-ink" aria-hidden /> Ready in minutes
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary-ink" aria-hidden /> 14-day money-back
                  promise
                </li>
              </ul>
            </div>
            <PackMock name={name} />
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 py-14 sm:py-20 space-y-16 sm:space-y-24">
          <section aria-labelledby="inc" className="space-y-8">
            <div className="max-w-2xl space-y-3">
              <p className="eyebrow">Inside the pack</p>
              <h2 id="inc" className="text-3xl sm:text-4xl font-semibold">
                What you get
              </h2>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FIXIT_INCLUDES.map((x) => (
                <li key={x} className="card flex gap-4 p-5 sm:p-6">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-primary/40">
                    <Check className="h-5 w-5 text-primary-ink" aria-hidden />
                  </span>
                  <span className="pt-1">{x}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="how" className="space-y-8">
            <div className="max-w-2xl space-y-3">
              <p className="eyebrow">Three steps</p>
              <h2 id="how" className="text-3xl sm:text-4xl font-semibold">
                How it works
              </h2>
            </div>
            <ol className="grid gap-4 md:grid-cols-3">
              {[
                "Pay once, securely. It takes under a minute.",
                "We use your free check to write every fix for your business.",
                "It appears on screen in a few minutes, with copy buttons, and we email you a copy.",
              ].map((x, i) => (
                <li
                  key={x}
                  className="relative rounded-3xl border border-border bg-secondary/60 p-6"
                >
                  <span className="font-display text-5xl font-semibold leading-none text-primary-ink">
                    {i + 1}
                  </span>
                  <p className="mt-4">{x}</p>
                </li>
              ))}
            </ol>
          </section>

          <section
            aria-labelledby="price"
            className="surface-navy rounded-[2rem] p-6 sm:p-10 lg:p-12 shadow-[var(--shadow-lift)] grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center"
          >
            <div className="space-y-4">
              <p className="eyebrow !text-primary">One price, paid once</p>
              <h2 id="price" className="text-3xl sm:text-4xl font-semibold text-white">
                Every fix, written for you
              </h2>
              <p className="flex items-baseline gap-3">
                <span className="font-display text-6xl font-semibold text-white">
                  {FIXIT_PRICE}
                </span>
                <span className="text-white/80">one-off, no subscription</span>
              </p>
              <p className="text-white/90">
                Less than one takeaway coffee a week for a month: {FIXIT_PRICE} / 30 days = 90p a
                day.
              </p>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 text-white/90">
                <strong className="text-white">Bonus: a free month of RepSuites Growth</strong>{" "}
                (normally £49). It asks your customers for reviews and writes your review replies,
                so the fixes keep working. No card needed. Worth £76 in total, yours for{" "}
                {FIXIT_PRICE}.
              </div>
              <div className="flex gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
                <ShieldCheck className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                <p className="text-white/90">
                  <strong className="text-white">14-day money-back promise.</strong> Not happy? Tell
                  us within 14 days and we will rewrite it or refund you in full.
                </p>
              </div>
            </div>
            <div className="rounded-3xl bg-card p-5 sm:p-6 text-foreground">
              <BuyButton token={r} />
            </div>
          </section>

          <section aria-labelledby="faq" className="grid gap-8 lg:grid-cols-[1fr_2fr]">
            <div className="space-y-3">
              <p className="eyebrow">Questions</p>
              <h2 id="faq" className="text-3xl sm:text-4xl font-semibold">
                Good to know
              </h2>
            </div>
            <div className="card divide-y divide-border overflow-hidden">
              {FIXIT_FAQ.map(([q, a]) => (
                <details key={q} className="faq group">
                  <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-5 py-4 font-bold hover:bg-secondary/60">
                    {q}
                    <ChevronDown
                      className="faq-chevron h-5 w-5 shrink-0 text-muted-foreground transition-transform"
                      aria-hidden
                    />
                  </summary>
                  <p className="px-5 pb-5 text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </main>
      <footer className="border-t border-border bg-secondary/60 py-8 text-center text-sm text-muted-foreground">
        RepSuites by Accelur8
      </footer>

      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md transition-transform duration-300 md:hidden ${
          showBar ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!showBar}
        inert={!showBar}
      >
        <BuyButton token={r} compact />
      </div>
    </div>
  );
}
