// After a Fix-It Pack payment. Writes the pack while they watch (about a
// minute), then opens it. The monthly plan is offered underneath.
// No em dashes (AGENTS.md).
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Logo } from "../components/site/Logo";
import { fixitProgress } from "../lib/fixit.functions";

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
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setStep((x) => Math.min(x + 1, STEPS.length - 1)), 9000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!s) return;
    let stop = false;
    async function tick() {
      while (!stop) {
        const p = await progress({ data: { s: s! } }).catch(() => null);
        if (p?.status === "ready") {
          await nav({ to: "/fix/pack/$key", params: { key: p.key } });
          return;
        }
        if (p?.status === "help") {
          setHelp(true);
          return;
        }
        await new Promise((res) => setTimeout(res, 4000));
      }
    }
    void tick();
    return () => {
      stop = true;
    };
  }, [s, progress, nav]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col text-base leading-relaxed">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Logo />
        </div>
      </header>
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-10 space-y-8">
        <section className="space-y-4" aria-live="polite">
          <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden />
          <h1 className="text-3xl font-bold">Thank you. We are writing your fixes now.</h1>
          {help ? (
            <p className="text-lg">
              We need one more detail to finish your pack. We will email you within the hour, or
              reply to your receipt email and we will sort it straight away.
            </p>
          ) : (
            <>
              <p className="text-lg text-muted-foreground">
                This takes about a minute. Keep this page open and your pack will appear here. We
                also email you a copy.
              </p>
              <ol className="space-y-2 rounded-2xl border border-border bg-card p-5">
                {STEPS.map((t, i) => (
                  <li
                    key={t}
                    className={`flex items-center gap-2 ${i > step ? "text-muted-foreground/60" : ""}`}
                  >
                    {i < step ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
                    ) : i === step ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
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
        <section className="rounded-2xl border-2 border-primary bg-card p-5 sm:p-6 space-y-3">
          <p className="font-semibold text-primary">Next step</p>
          <h2 className="text-2xl font-bold">Keep the reviews coming in, every week</h2>
          <p>
            Fixing your profile gets you seen. Steady new reviews keep you there. RepSuites sends
            review requests for you, gives you a QR card for the counter or van, and reruns your
            Google check each month so you can see the change.
          </p>
          <Link
            to="/start"
            search={r ? { r } : {}}
            className="flex min-h-14 w-full items-center justify-center rounded-full bg-primary px-6 text-lg font-bold text-primary-foreground"
          >
            Start free
          </Link>
        </section>
      </main>
    </div>
  );
}
