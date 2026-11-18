// The steps after a £27 Profile Fix Pack payment, one page at a time:
// 1. "Want us to put it in for you?" £22, first managed month free (one tap).
// 2. If yes: "After your free month" Managed £99/month, Growth £497/year, or later.
// Then hands back to the normal thank-you flow (details, pack writing).
// No em dashes (AGENTS.md).
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Check, CheckCircle2, Loader2 } from "lucide-react";
import { Logo } from "./Logo";
import { funnelPlan, funnelState, funnelUpsell } from "../../lib/fixit.functions";
import { INSTALL_PRICE, perDay } from "../../lib/fixit";
import { GROWTH, MANAGED } from "../../lib/shop";
import { trackPixel } from "../../lib/meta-pixel";

type Step = "loading" | "upsell" | "plan";

export function FunnelSteps({ s, onDone }: { s: string; onDone: () => void }) {
  const state = useServerFn(funnelState);
  const upsell = useServerFn(funnelUpsell);
  const plan = useServerFn(funnelPlan);
  const [step, setStep] = useState<Step>("loading");
  const [biz, setBiz] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function tick() {
      for (let n = 0; n < 30 && !stop; n++) {
        const r = await state({ data: { s } }).catch(() => null);
        if (r?.status === "upsell" || r?.status === "plan") {
          setBiz(r.business ?? null);
          setStep(r.status);
          return;
        }
        if (r?.status === "done") return onDone();
        await new Promise((res) => setTimeout(res, 2000));
      }
      if (!stop) onDone();
    }
    void tick();
    return () => {
      stop = true;
    };
  }, [s, state, onDone]);

  async function answer(accept: boolean) {
    setBusy(accept ? "yes" : "no");
    setErr(null);
    const r = await upsell({ data: { s, accept } }).catch(() => null);
    if (r?.ok && r.url) {
      window.location.href = r.url;
      return;
    }
    setBusy(null);
    if (!r?.ok) {
      setErr(r && !r.ok ? r.error : "Something went wrong. Your pack is still on its way.");
      return;
    }
    if (accept) {
      trackPixel(
        "Purchase",
        { currency: "GBP", value: 22, content_name: "Install add-on" },
        `${s}-i`,
      );
      setStep("plan");
    } else onDone();
  }

  async function choose(p: "managed" | "growth_year" | "later") {
    setBusy(p);
    setErr(null);
    const r = await plan({ data: { s, plan: p } }).catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      setErr(r && !r.ok ? r.error : "Something went wrong. We will message you.");
      return;
    }
    if (p !== "later")
      trackPixel("StartTrial", { currency: "GBP", value: p === "managed" ? 99 : 497 }, `${s}-p`);
    onDone();
  }

  const managedDay = perDay(MANAGED.monthPence * 12);
  const growthDay = perDay(GROWTH.yearPence);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col text-base leading-relaxed">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Logo />
        </div>
      </header>
      <main
        className="flex-1 w-full max-w-xl mx-auto px-4 py-10 sm:py-14 space-y-6"
        aria-live="polite"
      >
        <p className="inline-flex items-center gap-2 text-sm font-medium text-primary-ink">
          <CheckCircle2 className="h-5 w-5" aria-hidden /> Payment received. Your pack is being
          written.
        </p>

        {step === "loading" && (
          <p className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> One moment
          </p>
        )}

        {step === "upsell" && (
          <section className="space-y-5">
            <p className="text-sm uppercase tracking-wide text-muted-foreground">One last thing</p>
            <h1 className="text-3xl sm:text-4xl font-semibold">
              Want us to put it all in for you?
            </h1>
            <p className="text-lg">
              Your pack is ready to copy and paste. Or we can add every fix to{" "}
              {biz ? <b>{biz}</b> : "your profile"} for you, and look after it for a month.
            </p>
            <ul className="space-y-2">
              {[
                "We add every fix to your Google profile for you",
                "Your first month of our managed service, free",
                "Review requests, keyword-rich replies and weekly posts, done for you",
                "No calls, no logins shared. You add us as a manager in 2 taps",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="h-5 w-5 mt-0.5 text-primary-ink shrink-0" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <div className="rounded-2xl border border-border p-4 bg-gold-soft/40">
              <p className="text-2xl font-semibold">{INSTALL_PRICE} one-off</p>
              <p className="text-sm text-muted-foreground">
                Added to the card you just used. No forms. Nothing else taken.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-gold btn-lg w-full"
              disabled={!!busy}
              onClick={() => answer(true)}
            >
              {busy === "yes" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Adding it
                </span>
              ) : (
                `Yes, do it for me (${INSTALL_PRICE})`
              )}
            </button>
            <button
              type="button"
              className="w-full text-center underline text-muted-foreground min-h-11"
              disabled={!!busy}
              onClick={() => answer(false)}
            >
              No thanks, I will paste it in myself
            </button>
          </section>
        )}

        {step === "plan" && (
          <section className="space-y-5">
            <p className="text-sm uppercase tracking-wide text-muted-foreground">You are all set</p>
            <h1 className="text-3xl sm:text-4xl font-semibold">After your free month</h1>
            <p className="text-lg">
              Google favours profiles that stay active. Pick how you want to keep it going. Nothing
              is taken for 30 days, and you can cancel before then.
            </p>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => choose("managed")}
              className="w-full text-left rounded-2xl border-2 border-primary p-5 space-y-1 hover:bg-gold-soft/40 transition"
            >
              <p className="text-sm font-semibold uppercase text-primary-ink">Most popular</p>
              <p className="text-xl font-semibold">We keep doing it for you</p>
              <p>£99 a month after your free month ({managedDay}). Cancel any time.</p>
              {busy === "managed" && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => choose("growth_year")}
              className="w-full text-left rounded-2xl border border-border p-5 space-y-1 hover:bg-gold-soft/40 transition"
            >
              <p className="text-xl font-semibold">Do it yourself with our software, yearly</p>
              <p>£497 a year after your free month ({growthDay}). Saves £91 on monthly.</p>
              {busy === "growth_year" && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => choose("later")}
              className="w-full text-center underline text-muted-foreground min-h-11"
            >
              I will decide later
            </button>
          </section>
        )}
        {err && <p className="text-destructive">{err}</p>}
      </main>
    </div>
  );
}
