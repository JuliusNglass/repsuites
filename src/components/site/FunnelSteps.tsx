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

export function FunnelSteps({
  s,
  onDone,
  preview,
}: {
  s: string;
  onDone: () => void;
  preview?: "upsell" | "plan";
}) {
  const state = useServerFn(funnelState);
  const upsell = useServerFn(funnelUpsell);
  const plan = useServerFn(funnelPlan);
  const [step, setStep] = useState<Step>(preview ?? "loading");
  const [biz, setBiz] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
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
  }, [s, state, onDone, preview]);

  async function answer(accept: boolean) {
    if (preview) return setStep(accept ? "plan" : "upsell");
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
    if (preview) return;
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

  const STEPS = ["Payment", "Setup", "Keep it working"];
  const at = step === "plan" ? 2 : 1;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col text-base leading-relaxed">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Logo />
        </div>
      </header>
      <main
        className="flex-1 w-full max-w-xl mx-auto px-4 py-8 sm:py-12 space-y-6"
        aria-live="polite"
      >
        <div
          role="alert"
          className="rounded-2xl border-2 border-primary bg-gold-soft/60 p-4 space-y-3"
        >
          <p className="font-semibold text-lg">
            Payment received. Please don&apos;t close this page yet, you are not quite done.
          </p>
          <ol className="flex gap-2 text-sm" aria-label="Your order">
            {STEPS.map((t, i) => (
              <li
                key={t}
                className={`flex-1 rounded-full px-3 py-1.5 text-center font-medium ${
                  i < at
                    ? "bg-primary text-primary-foreground"
                    : i === at
                      ? "bg-background ring-2 ring-primary"
                      : "bg-background/60 text-muted-foreground"
                }`}
              >
                {i < at ? <Check className="inline h-4 w-4 mr-1" aria-hidden /> : null}
                {t}
              </li>
            ))}
          </ol>
        </div>

        {step === "loading" && (
          <p className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading your next step
          </p>
        )}

        {step === "upsell" && (
          <section className="space-y-5">
            <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
              Your pack is on its way. Now, be honest with yourself for a second.
            </h1>
            <p className="text-lg">Most owners we talk to think one of these when it arrives:</p>
            <ul className="space-y-2 text-lg">
              {[
                "\u201cI don\u2019t even know where to start in Google.\u201d",
                "\u201cI\u2019ll do it at the weekend.\u201d (Then the weekend fills up.)",
                "\u201cWhat if I put something in the wrong place and make it worse?\u201d",
              ].map((t) => (
                <li key={t} className="rounded-xl bg-muted/50 px-4 py-3 italic">
                  {t}
                </li>
              ))}
            </ul>
            <p className="text-lg">
              That is normal. You run a cleaning business, not a Google account. But a pack that
              sits in your inbox does nothing, and the {`£`}27 you just spent only pays off once it
              is live on your profile.
            </p>
            <h2 className="text-2xl font-semibold">So let us put it in for you.</h2>
            <ul className="space-y-2">
              {[
                `We add every fix to ${biz ?? "your profile"} for you, correctly, this week`,
                "Nothing to learn, nothing to remember, no risk of getting it wrong",
                "Plus your first month of us looking after it, free: review requests, keyword-rich replies and weekly posts",
                "No calls and no passwords. You add us as a manager in 2 taps, we send the steps",
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
                Less than one hour of a cleaner&apos;s time. Added to the card you just used, no
                forms. Nothing else is taken.
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
            <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
              Done. One last choice, so this keeps paying off.
            </h1>
            <p className="text-lg">
              Your profile is about to look its best. The catch: Google keeps checking whether a
              business is still active. Owners usually tell us:
            </p>
            <ul className="space-y-2 text-lg">
              {[
                "\u201cI never remember to ask customers for reviews.\u201d",
                "\u201cI don\u2019t know what to post, and I haven\u2019t got time to.\u201d",
                "\u201cI did all this once, then slipped back down.\u201d",
              ].map((t) => (
                <li key={t} className="rounded-xl bg-muted/50 px-4 py-3 italic">
                  {t}
                </li>
              ))}
            </ul>
            <p className="text-lg">
              Your free month covers that. After it, choose how you want to keep it going, so the
              work you have just paid for does not fade. Nothing is taken for 30 days, and you can
              cancel before then.
            </p>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => choose("managed")}
              className="w-full text-left rounded-2xl border-2 border-primary p-5 space-y-1 hover:bg-gold-soft/40 transition"
            >
              <p className="text-sm font-semibold uppercase text-primary-ink">Most popular</p>
              <p className="text-xl font-semibold">Keep doing it for me</p>
              <p>
                We ask for reviews, reply with your keywords and post every week. You do nothing.
              </p>
              <p className="font-medium">
                £99 a month after your free month ({managedDay}). Cancel any time.
              </p>
              {busy === "managed" && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => choose("growth_year")}
              className="w-full text-left rounded-2xl border border-border p-5 space-y-1 hover:bg-gold-soft/40 transition"
            >
              <p className="text-xl font-semibold">I&apos;ll do it, with your software</p>
              <p>Reminders, AI replies and post ideas, so you never forget. Billed yearly.</p>
              <p className="font-medium">
                £497 a year after your free month ({growthDay}). Saves £91 on monthly.
              </p>
              {busy === "growth_year" && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => choose("later")}
              className="w-full text-center underline text-muted-foreground min-h-11"
            >
              I will decide before my free month ends
            </button>
          </section>
        )}
        {err && <p className="text-destructive">{err}</p>}
      </main>
    </div>
  );
}
