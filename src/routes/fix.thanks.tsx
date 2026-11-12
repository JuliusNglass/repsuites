// After a Fix-It Pack payment. Writes the pack while they watch (about a
// minute), then opens it. The monthly plan is offered underneath.
// No em dashes (AGENTS.md).
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { trackPixel } from "../lib/meta-pixel";
import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Logo } from "../components/site/Logo";
import { BusinessSearch } from "../components/site/BusinessSearch";
import type { BusinessDetails } from "../lib/places.functions";
import { fixitDetails, fixitProgress } from "../lib/fixit.functions";

export const Route = createFileRoute("/fix/thanks")({
  validateSearch: z.object({ s: z.string().max(260).optional(), r: z.string().max(64).optional() }),
  head: () => ({
    meta: [{ title: "Thank you | RepSuites" }, { name: "robots", content: "noindex" }],
  }),
  component: Thanks,
});

const STEPS = [
  "Payment received",
  "Reading your Google check",
  "Writing your new business description",
  "Choosing your categories and services",
  "Writing your 4 Google posts and review replies",
  "Putting the steps in order",
];

function Thanks() {
  const { s, r } = Route.useSearch();
  const progress = useServerFn(fixitProgress);
  const saveDetails = useServerFn(fixitDetails);
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [help, setHelp] = useState(false);
  // "check": finding the order; "details": optional questions; "writing": pack on its way.
  const [phase, setPhase] = useState<"check" | "details" | "writing">("check");
  const [needsBusiness, setNeedsBusiness] = useState(false);
  const [bizName, setBizName] = useState<string | null>(null);
  const [x, setX] = useState({ areas: "", services: "", different: "" });
  const [bizText, setBizText] = useState("");
  const [place, setPlace] = useState<BusinessDetails | null>(null);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Count the sale once per checkout (same id as the server copy).
  useEffect(() => {
    if (!s) return;
    const k = `px-${s}`;
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {
      // private mode: still send
    }
    trackPixel("Purchase", { currency: "GBP", value: 27, content_name: "Fix-It Pack" }, s);
  }, [s]);

  useEffect(() => {
    if (phase !== "writing") return;
    const t = setInterval(() => setStep((v) => Math.min(v + 1, STEPS.length - 1)), 9000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (!s || phase === "details") return;
    let stop = false;
    async function tick() {
      while (!stop) {
        const p = await progress({ data: { s: s!, go: phase === "writing" } }).catch(() => null);
        if (p?.status === "ready") {
          await nav({ to: "/fix/pack/$key", params: { key: p.key } });
          return;
        }
        if (p?.status === "details") {
          setNeedsBusiness(p.needsBusiness);
          setBizName(p.business);
          setPhase("details");
          return;
        }
        if (p?.status === "help") {
          setHelp(true);
          return;
        }
        await new Promise((res) => setTimeout(res, phase === "check" ? 2500 : 4000));
      }
    }
    void tick();
    return () => {
      stop = true;
    };
  }, [s, phase, progress, nav]);

  async function go(skip: boolean) {
    if (!s) return;
    if (needsBusiness && !place) {
      setErr("Please find your business on Google first.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await saveDetails({
      data: {
        s,
        ...(skip ? {} : x),
        ...(place ? { placeId: place.placeId } : {}),
        ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
      },
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setErr(res && !res.ok ? res.error : "Something went wrong. Please try again.");
      return;
    }
    setPhase("writing");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col text-base leading-relaxed">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Logo />
        </div>
      </header>
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-12 sm:py-16 space-y-8">
        <section className="space-y-4" aria-live="polite">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-primary/40">
            <CheckCircle2 className="h-7 w-7 text-primary-ink" aria-hidden />
          </span>
          <h1 className="text-3xl sm:text-4xl font-semibold">
            Thank you. Your payment went through.
          </h1>
          {help ? (
            <p className="text-lg">
              We need one more detail to finish your pack. Reply to your receipt email and we will
              sort it straight away.
            </p>
          ) : phase === "details" ? (
            <div className="card space-y-5 p-5 sm:p-6">
              <p className="text-lg">
                {bizName
                  ? `A few quick answers make the pack for ${bizName} sound like you. All optional.`
                  : "Tell us which business this is for, then a few optional answers."}
              </p>
              {needsBusiness && (
                <div className="space-y-4">
                  <BusinessSearch
                    value={bizText}
                    onChange={setBizText}
                    confirmed={place}
                    onConfirm={setPlace}
                  />
                  <label className="block space-y-1">
                    <span className="font-semibold">
                      What do customers type into Google to find you?
                    </span>
                    <input
                      className="field"
                      value={keyword}
                      maxLength={60}
                      placeholder="For example: cleaning company"
                      onChange={(e) => setKeyword(e.target.value)}
                    />
                  </label>
                </div>
              )}
              {(
                [
                  [
                    "areas",
                    "Which areas do you cover?",
                    "For example: Newport, Cwmbran and Caerleon",
                  ],
                  [
                    "services",
                    "Any services we should mention?",
                    "For example: end of tenancy, office cleaning",
                  ],
                  [
                    "different",
                    "Anything that makes you different?",
                    "For example: same cleaner every visit, insured, eco products",
                  ],
                ] as const
              ).map(([k, label, ph]) => (
                <label key={k} className="block space-y-1">
                  <span className="font-semibold">
                    {label} <span className="font-normal text-muted-foreground">(optional)</span>
                  </span>
                  <textarea
                    className="field min-h-20"
                    value={x[k]}
                    maxLength={k === "areas" ? 300 : 500}
                    placeholder={ph}
                    onChange={(e) => setX({ ...x, [k]: e.target.value })}
                  />
                </label>
              ))}
              {err && (
                <p role="alert" className="font-semibold text-destructive">
                  {err}
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void go(false)}
                className="btn btn-gold btn-lg w-full"
              >
                {busy ? "Saving" : "Write my pack"}
              </button>
              {!needsBusiness && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void go(true)}
                  className="w-full min-h-11 underline"
                >
                  Skip and write it now
                </button>
              )}
            </div>
          ) : phase === "check" ? (
            <p className="flex items-center gap-2 text-lg text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Confirming your payment
            </p>
          ) : (
            <>
              <p className="text-lg text-muted-foreground">
                This takes about a minute. Keep this page open and your pack will appear here. We
                also email you a copy.
              </p>
              <ol className="card space-y-3 p-5 sm:p-6">
                {STEPS.map((t, i) => (
                  <li
                    key={t}
                    className={`flex items-center gap-2 ${i > step ? "text-muted-foreground" : ""}`}
                  >
                    {i < step ? (
                      <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
                    ) : i === step ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary-ink" aria-hidden />
                    ) : (
                      <span
                        className="inline-block h-5 w-5 rounded-full border border-border"
                        aria-hidden
                      />
                    )}
                    {t}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
        <section className="surface-navy rounded-3xl p-6 sm:p-8 space-y-4 shadow-[var(--shadow-lift)]">
          <p className="eyebrow !text-primary">Your bonus</p>
          <h2 className="text-2xl font-semibold">A free month of RepSuites Growth is yours</h2>
          <p className="text-white/85">
            Fixing your profile gets you seen. Steady new reviews keep you there. When your pack is
            ready, you can switch on your free month from the pack page, and the link is in your
            email too. Normally £49. No card needed.
          </p>
        </section>
      </main>
    </div>
  );
}
