// £1 review trial, after payment: confirm the business, add one customer,
// see the exact text, tap Send. The account is made at that moment.
// No em dashes (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Logo } from "../components/site/Logo";
import { BusinessSearch } from "../components/site/BusinessSearch";
import type { BusinessDetails } from "../lib/places.functions";
import { trialFinish, trialState } from "../lib/review-trial.functions";
import { TRIAL_DATA_PROMISE, trialCustomerProblem, trialPreview } from "../lib/review-trial";
import { trackPixel } from "../lib/meta-pixel";

export const Route = createFileRoute("/try/next")({
  validateSearch: z.object({ s: z.string().max(260).optional() }),
  head: () => ({
    meta: [
      { title: "Send your first request | RepSuites" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Next,
});

function Next() {
  const { s } = Route.useSearch();
  const state = useServerFn(trialState);
  const finish = useServerFn(trialFinish);
  const [phase, setPhase] = useState<"check" | "form" | "done" | "missing">("check");
  const [known, setKnown] = useState<{ name: string; placeId: string } | null>(null);
  const [bizText, setBizText] = useState("");
  const [place, setPlace] = useState<BusinessDetails | null>(null);
  const [c, setC] = useState({ name: "", phone: "", email: "" });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentBy, setSentBy] = useState<"sms" | "email">("sms");

  useEffect(() => {
    if (!s) {
      setPhase("missing");
      return;
    }
    let stop = false;
    void (async () => {
      for (let i = 0; i < 20 && !stop; i++) {
        const r = await state({ data: { s } }).catch(() => null);
        if (r?.status === "ready") {
          if (r.business) setKnown({ name: r.business, placeId: r.placeId });
          setPhase("form");
          try {
            if (!sessionStorage.getItem(`px-${s}`)) {
              sessionStorage.setItem(`px-${s}`, "1");
              trackPixel("StartTrial", { currency: "GBP", value: 1, predicted_ltv: 49 }, s);
            }
          } catch {
            // private mode
          }
          return;
        }
        if (r?.status === "missing") {
          setPhase("missing");
          return;
        }
        await new Promise((res) => setTimeout(res, 2500));
      }
      if (!stop) setPhase("missing");
    })();
    return () => {
      stop = true;
    };
  }, [s, state]);

  const business = known?.name ?? place?.name ?? "";
  const placeId = known?.placeId || place?.placeId || "";

  async function send() {
    if (!s) return;
    if (!business) return setErr("Find your business on Google first.");
    const p = trialCustomerProblem(c);
    if (p) return setErr(p);
    if (!agree) return setErr("Tick the box to confirm you can contact this customer.");
    setBusy(true);
    setErr(null);
    const r = await finish({
      data: { s, business, ...(placeId ? { placeId } : {}), ...c, agree },
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r && !r.ok ? r.error : "Something went wrong. Please try again.");
    setSentBy(r.channel);
    setPhase("done");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col text-base leading-relaxed">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Logo />
        </div>
      </header>
      <main
        className="flex-1 w-full max-w-xl mx-auto px-4 py-12 sm:py-16 space-y-6"
        aria-live="polite"
      >
        {phase === "check" && (
          <p className="flex items-center gap-2 text-lg text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Confirming your £1 payment
          </p>
        )}
        {phase === "missing" && (
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold">We can't see your payment yet.</h1>
            <p className="text-lg">
              If you've paid, reply to your Stripe receipt email and we'll set you up straight away.
            </p>
          </div>
        )}
        {phase === "form" && (
          <>
            <section className="space-y-2">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft">
                <CheckCircle2 className="h-6 w-6 text-primary-ink" aria-hidden />
              </span>
              <h1 className="text-3xl sm:text-4xl font-semibold">
                You're in. Let's ask your first customer.
              </h1>
              <p className="text-lg text-muted-foreground">
                Add the customer you just finished a job for. It takes 20 seconds.
              </p>
            </section>
            <section className="card space-y-5 p-5 sm:p-6">
              {known ? (
                <p>
                  Sending as <b>{known.name}</b>
                </p>
              ) : (
                <div className="space-y-1">
                  <span className="font-semibold">Your business</span>
                  <BusinessSearch
                    value={bizText}
                    onChange={setBizText}
                    confirmed={place}
                    onConfirm={setPlace}
                  />
                </div>
              )}
              <label className="block space-y-1">
                <span className="font-semibold">Customer's name</span>
                <input
                  className="field"
                  value={c.name}
                  maxLength={80}
                  autoComplete="off"
                  onChange={(e) => setC({ ...c, name: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold">Their mobile</span>
                <input
                  className="field"
                  type="tel"
                  inputMode="tel"
                  value={c.phone}
                  maxLength={30}
                  placeholder="07..."
                  autoComplete="off"
                  onChange={(e) => setC({ ...c, phone: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold">
                  Their email{" "}
                  <span className="font-normal text-muted-foreground">(if no mobile)</span>
                </span>
                <input
                  className="field"
                  type="email"
                  value={c.email}
                  maxLength={200}
                  autoComplete="off"
                  onChange={(e) => setC({ ...c, email: e.target.value })}
                />
              </label>
              <div className="space-y-1">
                <span className="font-semibold">What they'll get</span>
                <p className="rounded-2xl bg-muted p-4 whitespace-pre-line">
                  {trialPreview(c.name || "Sam", business)}
                </p>
                <p className="text-sm text-muted-foreground">
                  If they don't reply, one gentle reminder follows.
                </p>
              </div>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <span>
                  This is my customer and I'm happy for RepSuites to send them this one review
                  request on my behalf.
                </span>
              </label>
              {err && (
                <p role="alert" className="font-semibold text-destructive">
                  {err}
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void send()}
                className="btn btn-gold btn-lg w-full"
              >
                {busy ? "Sending" : "Send my first review request"}
              </button>
            </section>
            <p className="flex items-start gap-2 text-muted-foreground">
              <ShieldCheck className="h-5 w-5 flex-none text-success" aria-hidden />
              {TRIAL_DATA_PROMISE}
            </p>
          </>
        )}
        {phase === "done" && (
          <section className="space-y-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft">
              <CheckCircle2 className="h-6 w-6 text-primary-ink" aria-hidden />
            </span>
            <h1 className="text-3xl sm:text-4xl font-semibold">Sent. That's your first one.</h1>
            <p className="text-lg">
              Your request is on its way by {sentBy === "sms" ? "text" : "email"}. We've also
              emailed you a link to choose your password, so you can add a customer after every job
              in 20 seconds.
            </p>
            <a href="/login" className="btn btn-gold btn-lg w-full">
              Go to my RepSuites
            </a>
          </section>
        )}
      </main>
    </div>
  );
}
