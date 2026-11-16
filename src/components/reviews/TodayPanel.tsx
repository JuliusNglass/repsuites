// Home for a business whose Google profile is connected: what needs doing
// today, on one screen. Each card is one number, what it means, and one
// button to the place to act. No em dashes in this copy (AGENTS.md).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BarChart3,
  Loader2,
  Megaphone,
  MessageSquareReply,
  Send,
  Star,
} from "lucide-react";
import { getGoogleFn } from "../../lib/google-business.functions";
import { getRequestsFn } from "../../lib/review-requests.functions";

type Tab = "reviews" | "qr" | "ask" | "results" | "posts" | "settings";

interface Numbers {
  total: number;
  avg: number;
  toReply: number;
  newThisMonth: number;
  asked30: number;
  clicked30: number;
  toSendByHand: number;
  queued: number;
  nextPost: string | null;
  postsQueued: number;
}

const DAY = 86400000;

export function TodayPanel({ business, onTab }: { business: string; onTab: (t: Tab) => void }) {
  const google = useServerFn(getGoogleFn);
  const requests = useServerFn(getRequestsFn);
  const [n, setN] = useState<Numbers | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([google(), requests()])
      .then(([g, r]) => {
        if (!live) return;
        const now = Date.now();
        const reviews = g.ok ? g.reviews : [];
        const posts = g.ok ? g.posts : [];
        const reqs = r.ok ? r.requests : [];
        const rated = reviews.filter((x) => x.stars > 0);
        const future = posts
          .filter((p) => !["posted", "failed", "cancelled"].includes(p.status))
          .filter((p) => new Date(p.publishAt).getTime() > now)
          .sort((a, b) => a.publishAt.localeCompare(b.publishAt));
        const within30 = (d: string | null) => !!d && now - new Date(d).getTime() < 30 * DAY;
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        setN({
          total: reviews.length,
          avg: rated.length ? rated.reduce((s, x) => s + x.stars, 0) / rated.length : 0,
          toReply: reviews.filter((x) => !x.reply).length,
          newThisMonth: reviews.filter((x) => x.at && new Date(x.at) >= monthStart).length,
          asked30: reqs.filter((x) => within30(x.lastSentAt)).length,
          clicked30: reqs.filter((x) => within30(x.clickedAt)).length,
          toSendByHand: reqs.filter(
            (x) =>
              (x.channel === "whatsapp" || x.channel === "sms") &&
              x.status === "due" &&
              new Date(x.dueAt).getTime() <= now,
          ).length,
          queued: reqs.filter((x) => x.status === "due" || x.status === "waiting").length,
          nextPost: future[0]?.publishAt ?? null,
          postsQueued: future.length,
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [google, requests]);

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  const cards = n
    ? [
        {
          icon: MessageSquareReply,
          big: n.toReply,
          label: n.toReply === 1 ? "review needs a reply" : "reviews need a reply",
          hint: n.toReply
            ? "Replies are drafted for you. Check and post."
            : "Every review has a reply. Nice work.",
          tab: "reviews" as Tab,
          button: n.toReply ? "Reply now" : "See reviews",
          urgent: n.toReply > 0,
        },
        {
          icon: Send,
          big: n.asked30,
          label: "customers asked in the last 30 days",
          hint: n.toSendByHand
            ? `${n.toSendByHand} ready to send from your phone.`
            : n.queued
              ? `${n.queued} more queued. They go out a few a day.`
              : "Add past customers and we ask for you.",
          tab: "ask" as Tab,
          button: n.toSendByHand ? "Send now" : n.queued ? "See requests" : "Add customers",
          urgent: n.toSendByHand > 0 || n.queued === 0,
        },
        {
          icon: Megaphone,
          big: n.postsQueued,
          label: n.postsQueued === 1 ? "Google post planned" : "Google posts planned",
          hint: n.nextPost
            ? `Next one goes out ${day(n.nextPost)}.`
            : "Plan a month of posts in one go.",
          tab: "posts" as Tab,
          button: n.postsQueued ? "See posts" : "Plan my month",
          urgent: n.postsQueued === 0,
        },
        {
          icon: BarChart3,
          big: n.clicked30,
          label: "customers tapped your review link (30 days)",
          hint: "See your map ranking, calls and directions.",
          tab: "results" as Tab,
          button: "See results",
          urgent: false,
        },
      ]
    : [];

  return (
    <section
      aria-labelledby="today-title"
      className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="today-title" className="text-xl font-bold">
            Today for {business}
          </h2>
          <p className="text-base text-muted-foreground">
            What needs doing, and what is already working.
          </p>
        </div>
        {n && n.total > 0 && (
          <div className="flex items-center gap-3 rounded-2xl bg-muted/60 px-4 py-2">
            <Star className="h-6 w-6 fill-primary text-primary" aria-hidden />
            <p className="text-base">
              <span className="text-xl font-bold">{n.avg.toFixed(1)}</span> from{" "}
              <span className="font-bold">{n.total}</span> Google reviews
              {n.newThisMonth > 0 && (
                <span className="ml-1 font-semibold text-emerald-700">
                  (+{n.newThisMonth} this month)
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {!n && !failed && (
        <p className="mt-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading your numbers
        </p>
      )}
      {failed && (
        <p className="mt-6 text-muted-foreground">
          Could not load your numbers. Try again in a moment.
        </p>
      )}

      {n && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <li
                key={c.label}
                className={`flex flex-col rounded-2xl border p-4 transition-shadow hover:shadow-md ${
                  c.urgent ? "border-primary/60 bg-primary/10" : "border-border bg-background"
                }`}
              >
                <Icon className="h-6 w-6 text-primary-ink" aria-hidden />
                <p className="mt-2 text-4xl font-bold leading-none">{c.big}</p>
                <p className="mt-1 font-semibold leading-snug">{c.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{c.hint}</p>
                <button
                  type="button"
                  onClick={() => onTab(c.tab)}
                  className={`mt-auto inline-flex min-h-11 items-center justify-center gap-1 rounded-xl px-4 pt-0 font-bold ${
                    c.urgent ? "bg-primary text-primary-foreground" : "border border-border"
                  } mt-4`}
                >
                  {c.button} <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
