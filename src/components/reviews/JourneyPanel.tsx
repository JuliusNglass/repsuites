// "Home" tab: the RepSuites journey on one screen, step by step. Left: the
// six steps with their status. Right: what the chosen step does, in plain
// words, with one button to open it. Back / Next walk through the steps, so
// an owner (or a screen-share demo) sees what the app does without long
// scrolls. No em dashes in this copy (AGENTS.md).
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Circle,
  Link2,
  MessageSquareReply,
  Megaphone,
  QrCode,
  Send,
} from "lucide-react";

type Tab = "reviews" | "qr" | "ask" | "results" | "posts" | "settings";

interface Step {
  id: string;
  icon: typeof Link2;
  title: string;
  short: string;
  what: string;
  points: string[];
  tab: Tab;
  button: string;
  done?: boolean;
}

export function JourneyPanel({
  business,
  googleConnected,
  qrDownloaded,
  onTab,
}: {
  business: string;
  googleConnected: boolean;
  qrDownloaded: boolean;
  onTab: (t: Tab) => void;
}) {
  const steps: Step[] = [
    {
      id: "google",
      icon: Link2,
      title: "Connect Google",
      short: "Link your Google Business Profile",
      what: "One click links your Google profile. RepSuites can then read your reviews, reply for you, post updates and show how many people find you.",
      points: ["No passwords shared with us", "Takes about a minute", "Or we can do it for you"],
      tab: "settings",
      button: googleConnected ? "See connection" : "Connect Google",
      done: googleConnected,
    },
    {
      id: "qr",
      icon: QrCode,
      title: "Your QR card",
      short: "Customers scan to leave a review",
      what: "Your own QR code takes happy customers straight to your Google review box. Unhappy ones can message you privately first.",
      points: [
        "Print it or order a table stand",
        "Works on any phone camera",
        "Every scan is counted",
      ],
      tab: "qr",
      button: "Open my QR card",
      done: qrDownloaded,
    },
    {
      id: "ask",
      icon: Send,
      title: "Ask past customers",
      short: "Upload a list, we ask for you",
      what: "Upload your customer list (a spreadsheet or CSV) or connect your accounts software. RepSuites sends a polite review request to each customer, a few a day, with one gentle reminder.",
      points: [
        "A steady trickle, never a sudden burst",
        "Email, or text with the Text Pack",
        "Anyone who opts out is never asked again",
      ],
      tab: "ask",
      button: "Add customers",
    },
    {
      id: "reply",
      icon: MessageSquareReply,
      title: "Reply to reviews",
      short: "AI writes a reply to every review",
      what: "Every new Google review gets a reply drafted in your voice. Approve it with one tap, or let RepSuites post good ones for you automatically.",
      points: [
        "Thanks them and mentions your service and town",
        "Bad reviews wait for you to check",
        "Replies within 48 hours help your ranking",
      ],
      tab: "reviews",
      button: "See my reviews",
    },
    {
      id: "posts",
      icon: Megaphone,
      title: "Weekly Google posts",
      short: "A fresh post every week",
      what: "RepSuites plans a month of Google posts from your reviews and photos. You approve once, and one goes out every Tuesday to keep your profile active.",
      points: [
        "Written for your business and town",
        "Approve once a month",
        "Active profiles rank higher",
      ],
      tab: "posts",
      button: "See my posts",
    },
    {
      id: "results",
      icon: BarChart3,
      title: "See your results",
      short: "Rankings, calls and reviews",
      what: "See where you show up on the Google map for your main searches, how many people called or asked for directions, and how your reviews are growing. A plain-English report comes every month.",
      points: [
        "Map ranking for your search terms",
        "Calls, directions and website clicks",
        "Monthly report by email",
      ],
      tab: "results",
      button: "See my results",
    },
  ];
  const first = steps.findIndex((s) => !s.done);
  const [i, setI] = useState(first === -1 ? 0 : first);
  const s = steps[i] ?? steps[0]!;
  const Icon = s.icon;
  const doneCount = steps.filter((x) => x.done).length;

  return (
    <section
      aria-labelledby="journey-title"
      className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <h2 id="journey-title" className="text-xl font-bold">
            How RepSuites grows {business}
          </h2>
          <p className="text-base text-muted-foreground">
            Six simple steps. Pick one to see what it does.
          </p>
        </div>
        <p className="text-base font-semibold text-muted-foreground" aria-live="polite">
          Step {i + 1} of {steps.length}
        </p>
      </div>

      <div className="grid md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <ol className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible border-b md:border-b-0 md:border-r border-border p-2 sm:p-3">
          {steps.map((x, n) => {
            const XIcon = x.icon;
            const on = n === i;
            return (
              <li key={x.id} className="shrink-0 md:shrink">
                <button
                  type="button"
                  onClick={() => setI(n)}
                  aria-current={on ? "step" : undefined}
                  className={`flex w-full min-h-12 items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors ${
                    on ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-muted"
                  }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                      on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    <XIcon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold leading-tight">
                      {n + 1}. {x.title}
                    </span>
                    <span className="hidden md:block text-sm text-muted-foreground leading-snug">
                      {x.short}
                    </span>
                  </span>
                  {x.done ? (
                    <CheckCircle2
                      className="ml-auto h-5 w-5 shrink-0 text-emerald-700"
                      aria-label="Done"
                    />
                  ) : (
                    <Circle
                      className="ml-auto hidden md:block h-5 w-5 shrink-0 text-muted-foreground/50"
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        <div
          key={s.id}
          className="flex flex-col p-5 sm:p-7 animate-in fade-in slide-in-from-right-2 duration-300"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Step {i + 1}
              </p>
              <h3 className="text-2xl font-bold leading-tight">{s.title}</h3>
            </div>
            {s.done && (
              <span className="ml-auto rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
                Done
              </span>
            )}
          </div>
          <p className="mt-4 max-w-prose text-lg leading-relaxed">{s.what}</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-3">
            {s.points.map((p) => (
              <li
                key={p}
                className="flex items-start gap-2 rounded-2xl bg-muted/60 px-3 py-3 text-base"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
            <button
              type="button"
              onClick={() => onTab(s.tab)}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-base font-bold text-primary-foreground shadow-sm hover:opacity-95"
            >
              {s.button} <ArrowRight className="h-5 w-5" aria-hidden />
            </button>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setI((n) => Math.max(0, n - 1))}
                disabled={i === 0}
                className="inline-flex min-h-12 items-center gap-1 rounded-xl border border-border px-4 font-semibold disabled:opacity-40"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden /> Back
              </button>
              <button
                type="button"
                onClick={() => setI((n) => Math.min(steps.length - 1, n + 1))}
                disabled={i === steps.length - 1}
                className="inline-flex min-h-12 items-center gap-1 rounded-xl border border-border px-4 font-semibold disabled:opacity-40"
              >
                Next <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {doneCount} of {steps.length} set up
          </p>
        </div>
      </div>
    </section>
  );
}
