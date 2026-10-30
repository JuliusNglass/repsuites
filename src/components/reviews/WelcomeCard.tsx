// For businesses on the free plan: three easy first steps and the
// RepSuites Growth upgrade. No em dashes in this copy (AGENTS.md).
import { ArrowRight, CheckCircle2, Circle, Sparkles } from "lucide-react";
import { GROWTH, money } from "../../lib/shop";

export function WelcomeCard({
  googleConnected,
  welcome,
  onTab,
}: {
  googleConnected: boolean;
  welcome: boolean;
  onTab: (t: "settings" | "qr") => void;
}) {
  const steps = [
    {
      done: googleConnected,
      title: "Connect your Google profile",
      text: "See how many people find you, call you and ask for directions.",
      action: (
        <>
          <button
            type="button"
            onClick={() => onTab("settings")}
            className="font-semibold underline"
          >
            Connect Google
          </button>{" "}
          or{" "}
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem("open-access-help", "1");
              } catch {
                // fine: the card just opens closed
              }
              onTab("settings");
            }}
            className="font-semibold underline"
          >
            let us do it for you
          </button>
        </>
      ),
    },
    {
      done: false,
      title: "Print your QR code",
      text: "Put it by the till, on tables or on receipts. Customers scan it to leave a review.",
      action: (
        <button type="button" onClick={() => onTab("qr")} className="font-semibold underline">
          Get my QR code
        </button>
      ),
    },
    {
      done: false,
      title: "Get a table stand or review cards",
      text: "Customers tap or scan in one second. Stands from £29, or 2 for £49. Cards from £15.",
      action: (
        <a href="/cards" className="font-semibold underline">
          See stands and cards
        </a>
      ),
    },
  ];
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-lg font-bold">
          {welcome ? "Welcome! Your free account is ready" : "Get more reviews in 3 steps"}
        </h2>
        <ol className="mt-3 space-y-3">
          {steps.map((s) => (
            <li key={s.title} className="flex gap-3">
              {s.done ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div className="text-sm">
                <p
                  className={`font-semibold ${s.done ? "line-through text-muted-foreground" : ""}`}
                >
                  {s.title}
                </p>
                {!s.done && (
                  <p className="text-muted-foreground">
                    {s.text} {s.action}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="rounded-2xl bg-primary/10 border border-primary/30 p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="flex-1">
          <h2 className="font-bold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> Let RepSuites do the work
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            With Growth, AI writes your review replies, we ask customers for reviews, and you see
            where you show up on Google Maps. {money(GROWTH.monthPence)} a month. Cancel any time.
          </p>
        </div>
        <a
          href="/pricing"
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground font-bold px-4 py-3"
        >
          Upgrade to Growth <ArrowRight className="w-4 h-4" />
        </a>
      </section>
    </div>
  );
}
