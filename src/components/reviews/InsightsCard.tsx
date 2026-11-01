// Customer Insights: what customers praise and complain about, staff they
// name, the trend, and one thing to do. Built from reviews and private
// feedback. No em dashes in this copy (AGENTS.md).
import { useEffect, useState } from "react";
import { Lightbulb, Loader2, RefreshCw, ThumbsDown, ThumbsUp, Users } from "lucide-react";
import { toast } from "sonner";
import { getInsightsFn, refreshInsightsFn } from "../../lib/google-business.functions";
import type { StoredInsights } from "../../lib/insights.server";
import type { Theme } from "../../lib/insights";

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Themes({ items, tone }: { items: Theme[]; tone: "good" | "bad" }) {
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t.theme} className="text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{t.theme}</span>
            <span
              className={`text-[11px] font-semibold shrink-0 ${tone === "good" ? "text-emerald-700" : "text-destructive"}`}
            >
              {t.mentions} mention{t.mentions === 1 ? "" : "s"}
            </span>
          </div>
          {t.quote && <p className="text-xs text-muted-foreground">"{t.quote}"</p>}
        </li>
      ))}
    </ul>
  );
}

export function InsightsCard() {
  const [data, setData] = useState<StoredInsights | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getInsightsFn().then((r) => setData(r.ok ? r.insights : null));
  }, []);

  async function refresh() {
    setBusy(true);
    try {
      const r = await refreshInsightsFn();
      if (r.ok) setData(r.insights);
      else toast.error(r.error);
    } catch {
      toast.error("Could not build the summary. Try again.");
    }
    setBusy(false);
  }

  const s = data?.summary ?? null;
  const f = data?.facts;

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">What your customers are saying</h3>
          <p className="text-xs text-muted-foreground">
            {data
              ? `From reviews and private messages in the last ${(f?.periodDays ?? 90) >= 365 ? "12 months" : `${f?.periodDays ?? 90} days`}. Updated ${when(data.createdAt)}.`
              : "A plain-English summary of your reviews and private messages."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy || data === undefined}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {data ? "Update" : "Build summary"}
        </button>
      </div>

      {data === undefined && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {data === null && !busy && (
        <p className="text-sm text-muted-foreground">
          No summary yet. Click Build summary and we will read every review and message for you.
        </p>
      )}
      {busy && !s && <p className="text-sm text-muted-foreground">Reading your feedback...</p>}
      {data && !s && data.error && <p className="text-sm text-muted-foreground">{data.error}</p>}

      {f && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/60 p-2">
            <div className="text-lg font-extrabold">{f.reviews}</div>
            <div className="text-[11px] text-muted-foreground">
              new reviews (was {f.reviewsBefore})
            </div>
          </div>
          <div className="rounded-lg bg-muted/60 p-2">
            <div className="text-lg font-extrabold">{f.avg ?? "-"}</div>
            <div className="text-[11px] text-muted-foreground">
              average stars{f.avgBefore !== null ? ` (was ${f.avgBefore})` : ""}
            </div>
          </div>
          <div className="rounded-lg bg-muted/60 p-2">
            <div className="text-lg font-extrabold">{f.privateMessages}</div>
            <div className="text-[11px] text-muted-foreground">private messages</div>
          </div>
        </div>
      )}

      {s && (
        <>
          <p className="text-sm font-medium">{s.headline}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700 mb-2">
                <ThumbsUp className="w-3.5 h-3.5" /> What they love
              </p>
              {s.praises.length ? (
                <Themes items={s.praises} tone="good" />
              ) : (
                <p className="text-xs text-muted-foreground">Nothing stands out yet.</p>
              )}
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-destructive mb-2">
                <ThumbsDown className="w-3.5 h-3.5" /> What needs attention
              </p>
              {s.complaints.length ? (
                <Themes items={s.complaints} tone="bad" />
              ) : (
                <p className="text-xs text-muted-foreground">No recurring complaints. Well done.</p>
              )}
            </div>
          </div>
          {s.people.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                <Users className="w-3.5 h-3.5" /> Staff customers mention
              </p>
              <div className="flex flex-wrap gap-1.5">
                {s.people.map((p) => (
                  <span
                    key={p.name}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.tone === "positive" ? "bg-emerald-50 text-emerald-800" : p.tone === "negative" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}
                  >
                    {p.name} ({p.mentions})
                  </span>
                ))}
              </div>
            </div>
          )}
          {s.trend && <p className="text-sm text-muted-foreground">{s.trend}</p>}
          <div className="rounded-lg bg-primary/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide mb-1">
              <Lightbulb className="w-3.5 h-3.5" /> One thing to do this month
            </p>
            <p className="text-sm font-semibold">{s.action.title}</p>
            <p className="text-xs text-muted-foreground">{s.action.why}</p>
          </div>
        </>
      )}
    </section>
  );
}
