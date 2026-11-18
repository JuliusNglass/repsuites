// £27 Profile Fix Pack landing page (/profile), for cold ad traffic from UK
// cleaning business owners. Explainer video, what you get, pay on the page.
// After paying, /fix/thanks?o=p27 offers the add-ons. No em dashes (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Check, ChevronDown, Clock, Loader2, Lock, MessageCircle, ShieldCheck } from "lucide-react";
import { Logo } from "../components/site/Logo";
import { startFixitCheckout } from "../lib/fixit.functions";
import { PACK27_FAQ, PACK27_INCLUDES, PACK27_PENCE, PACK27_PRICE, perDay } from "../lib/fixit";
import { newEventId, trackPixel } from "../lib/meta-pixel";

// The explainer (2:30, chalkboard). Set once the video is uploaded.
export const PROFILE_VSL = "/media/profile-explainer.mp4";
const POSTER = "/media/profile-explainer.jpg";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Get found on Google | For UK cleaning businesses | RepSuites" },
      {
        name: "description",
        content:
          "For UK cleaning business owners. We check your Google profile and write every missing piece for you. £27, on your WhatsApp within 30 minutes.",
      },
    ],
  }),
  component: ProfilePage,
});

function BuyButton({ label }: { label?: string }) {
  const start = useServerFn(startFixitCheckout);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    trackPixel("InitiateCheckout", { currency: "GBP", value: PACK27_PENCE / 100 }, newEventId());
    const r = await start({ data: { offer: "p27" } }).catch(() => null);
    if (r?.ok) {
      window.location.href = r.url;
      return;
    }
    setErr(r && !r.ok ? r.error : "Something went wrong. Please try again.");
    setBusy(false);
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={go} disabled={busy} className="btn btn-gold btn-lg w-full">
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Opening secure checkout
          </span>
        ) : (
          (label ?? `Get my Fix Pack for ${PACK27_PRICE}`)
        )}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="h-4 w-4" aria-hidden /> Secure card payment by Stripe. One-off, no
        subscription.
      </p>
      {err && <p className="text-destructive text-center">{err}</p>}
    </div>
  );
}

function ProfilePage() {
  useEffect(
    () => trackPixel("ViewContent", { content_name: "Profile Fix Pack" }, newEventId()),
    [],
  );
  return (
    <div className="min-h-screen bg-background text-foreground text-base leading-relaxed">
      <header className="border-b border-border/70">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Logo />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12 space-y-10">
        <section className="space-y-4 text-center">
          <p className="inline-block rounded-full bg-gold-soft px-3 py-1 text-sm font-semibold text-primary-ink">
            For UK cleaning business owners
          </p>
          <h1 className="text-3xl sm:text-5xl font-semibold leading-tight">
            Not getting the calls you should from Google?
          </h1>
          <p className="text-lg text-muted-foreground">
            Watch how Google picks which cleaners to show, and the simple fix that gets you seen
            across the areas you cover.
          </p>
        </section>

        <div className="rounded-2xl overflow-hidden ring-1 ring-border bg-black aspect-video">
          <video
            className="w-full h-full"
            src={PROFILE_VSL}
            poster={POSTER}
            controls
            playsInline
            preload="metadata"
          >
            <track kind="captions" />
          </video>
        </div>

        <BuyButton />

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">What you get for {PACK27_PRICE}</h2>
          <p>
            We check your Google profile and write every missing piece for you, ready to copy and
            paste.
          </p>
          <ul className="space-y-3">
            {PACK27_INCLUDES.map((t) => (
              <li key={t} className="flex gap-3">
                <Check className="h-5 w-5 mt-0.5 text-primary-ink shrink-0" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
          <div className="grid sm:grid-cols-3 gap-3 pt-2">
            <Fact
              icon={<MessageCircle className="h-5 w-5" />}
              text="On your WhatsApp within 30 minutes"
            />
            <Fact
              icon={<Clock className="h-5 w-5" />}
              text="5 to 20 minutes to paste in. No calls"
            />
            <Fact icon={<ShieldCheck className="h-5 w-5" />} text="No Google login needed" />
          </div>
        </section>

        <section className="rounded-2xl bg-gold-soft/50 p-5 space-y-2">
          <h2 className="text-xl font-semibold">Does it pay for itself?</h2>
          <p>
            One clean is worth about £60. One extra booking from Google pays for this pack twice.
            Spread over a year, {PACK27_PRICE} is {perDay(PACK27_PENCE)}.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Questions</h2>
          {PACK27_FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-xl border border-border p-4">
              <summary className="flex justify-between items-center cursor-pointer font-medium list-none">
                {q}
                <ChevronDown className="h-5 w-5 transition group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-2 text-muted-foreground">{a}</p>
            </details>
          ))}
        </section>

        <BuyButton label={`Yes, fix my profile for ${PACK27_PRICE}`} />
        <p className="text-center text-sm text-muted-foreground">Accelur8 · RepSuites</p>
      </main>
    </div>
  );
}

function Fact({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm">
      <span className="text-primary-ink" aria-hidden>
        {icon}
      </span>
      {text}
    </div>
  );
}
