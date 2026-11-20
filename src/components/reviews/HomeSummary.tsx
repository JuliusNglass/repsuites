// Home on a phone: one big action, three numbers, and what needs the owner.
// Setup shows as a short progress bar until it is done. No em dashes (AGENTS.md).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, ChevronRight, Loader2, MessageSquareReply, Send } from "lucide-react";
import { getGoogleFn } from "../../lib/google-business.functions";
import { getRequestsFn } from "../../lib/review-requests.functions";

type Tab = "ask" | "reviews" | "qr" | "settings";

interface Numbers {
  asked: number;
  opened: number;
  reviews: number;
  toReply: number;
  toSend: number;
  anyAsked: boolean;
}

export function HomeSummary({
  googleConnected,
  qrDownloaded,
  onTab,
}: {
  googleConnected: boolean;
  qrDownloaded: boolean;
  onTab: (t: Tab) => void;
}) {
  const google = useServerFn(getGoogleFn);
  const requests = useServerFn(getRequestsFn);
  const [n, setN] = useState<Numbers | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([google().catch(() => null), requests()])
      .then(([g, r]) => {
        if (!live) return;
        const now = Date.now();
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        const since = (d: string | null | undefined) => !!d && new Date(d) >= start;
        const reviews = g && g.ok ? g.reviews : [];
        const reqs = r.ok ? r.requests : [];
        setN({
          asked: reqs.filter((x) => since(x.lastSentAt)).length,
          opened: reqs.filter((x) => since(x.clickedAt)).length,
          reviews: reviews.filter((x) => since(x.at)).length,
          toReply: reviews.filter((x) => !x.reply).length,
          toSend: reqs.filter(
            (x) =>
              (x.channel === "whatsapp" || x.channel === "sms") &&
              x.status === "due" &&
              new Date(x.dueAt).getTime() <= now,
          ).length,
          anyAsked: reqs.length > 0,
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [google, requests]);

  const steps: { label: string; done: boolean; tab: Tab }[] = [
    { label: "Ask your first customer", done: !!n?.anyAsked, tab: "ask" },
    { label: "Connect Google", done: googleConnected, tab: "settings" },
    { label: "Get your QR card", done: qrDownloaded, tab: "qr" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  const needs = n
    ? [
        n.toReply > 0 && {
          icon: MessageSquareReply,
          text: `${n.toReply} ${n.toReply === 1 ? "review needs" : "reviews need"} a reply`,
          action: "Reply",
          tab: "reviews" as Tab,
        },
        n.toSend > 0 && {
          icon: Send,
          text: `${n.toSend} ${n.toSend === 1 ? "request" : "requests"} to send from your phone`,
          action: "Send",
          tab: "ask" as Tab,
        },
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-5">
      {n && next && (
        <button
          type="button"
          onClick={() => onTab(next.tab)}
          className="w-full text-left rounded-2xl bg-muted/60 p-4 space-y-2"
        >
          <p className="text-base text-muted-foreground">
            Setup {doneCount} of {steps.length}
          </p>
          <div className="h-2 rounded-full bg-border overflow-hidden" aria-hidden="true">
            <div
              className="h-full rounded-full bg-success transition-all duration-500"
              style={{ width: `${(doneCount / steps.length) * 100}%` }}
            />
          </div>
          <p className="flex items-center gap-1 font-semibold">
            Next: {next.label} <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </p>
        </button>
      )}

      <button
        type="button"
        onClick={() => onTab("ask")}
        className="btn btn-gold btn-lg w-full text-lg"
      >
        <Send className="w-5 h-5" aria-hidden="true" /> Ask a customer for a review
      </button>

      <section aria-label="This month" className="space-y-2">
        <p className="text-base text-muted-foreground">This month</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["Asked", n?.asked],
              ["Opened", n?.opened],
              ["New reviews", n?.reviews],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="rounded-xl bg-muted/60 p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">
                {v ?? <Loader2 className="w-5 h-5 animate-spin mx-auto" aria-label="Loading" />}
              </p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {failed && (
        <p className="text-muted-foreground">Couldn't load your numbers. Pull to refresh.</p>
      )}

      {n && (
        <section aria-label="Needs you" className="space-y-1">
          <p className="text-base text-muted-foreground">Needs you</p>
          {needs.length === 0 ? (
            <p className="flex items-center gap-2 py-3">
              <Check className="w-5 h-5 text-success" aria-hidden="true" /> All caught up.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {needs.map(
                (x) =>
                  x && (
                    <li key={x.text}>
                      <button
                        type="button"
                        onClick={() => onTab(x.tab)}
                        className="w-full min-h-14 flex items-center gap-3 px-4 py-3 text-left"
                      >
                        <x.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                        <span className="flex-1">{x.text}</span>
                        <span className="rounded-full bg-gold-soft px-3 py-1 text-sm font-semibold">
                          {x.action}
                        </span>
                        <ChevronRight
                          className="w-4 h-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  ),
              )}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
