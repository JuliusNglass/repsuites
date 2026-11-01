// "Are AI assistants recommending you?" on the Results tab.
// No em dashes in this copy (AGENTS.md).
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getAiVisibilityFn, runAiVisibilityFn } from "../../lib/ai-visibility.functions";
import { aiSummary } from "../../lib/ai-visibility";

type Data = Extract<Awaited<ReturnType<typeof getAiVisibilityFn>>, { ok: true }>;

const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

export function AiVisibilityCard() {
  const load = useServerFn(getAiVisibilityFn);
  const run = useServerFn(runAiVisibilityFn);
  const [d, setD] = useState<Data | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [service, setService] = useState("");
  const [town, setTown] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await load().catch(() => null);
    if (r?.ok) {
      setD(r);
      setService((v) => v || r.service);
      setTown((v) => v || r.town);
    } else setBlocked(r?.error ?? "Could not load.");
  }, [load]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (blocked)
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-bold flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" /> Are AI assistants recommending you?
        </h3>
        <p className="text-sm text-muted-foreground mt-1">{blocked}</p>
      </section>
    );
  if (!d) return null;

  const l = d.latest;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="font-bold flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" /> Are AI assistants recommending you?
        </h3>
        <p className="text-xs text-muted-foreground">
          More people now ask an AI assistant who to use. We ask an assistant that searches the web
          (Claude) the questions your customers would, and see who it recommends and where it
          looked. Answers vary, so watch the trend month to month.
        </p>
      </div>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input
          aria-label="Type of business"
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="Type of business, e.g. burger restaurant"
          className={field}
        />
        <input
          aria-label="Your town"
          value={town}
          onChange={(e) => setTown(e.target.value)}
          placeholder="Your town, e.g. Newport"
          className={field}
        />
        <button
          type="button"
          disabled={busy || !d.ready || service.trim().length < 3 || town.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            const r = await run({ data: { service, town } }).catch(() => null);
            setBusy(false);
            if (r?.ok) toast.success("Checked");
            else toast.error(r?.error ?? "Could not check.");
            await refresh();
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold disabled:opacity-50"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {busy ? "Asking (about 1 minute)" : "Check now"}
        </button>
      </div>
      {!d.ready && <p className="text-xs text-muted-foreground">This check switches on shortly.</p>}
      {l && l.total > 0 && (
        <div className="space-y-2">
          <p className="text-sm">
            Named in{" "}
            <b>
              {l.named} of {l.total}
            </b>{" "}
            answers
            <span className="text-muted-foreground">
              {" "}
              (checked{" "}
              {new Date(l.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})
            </span>
          </p>
          {(() => {
            const sum = aiSummary(l.results, d.business);
            return (
              <div className="grid sm:grid-cols-2 gap-3">
                {sum.rivals.length > 0 && (
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="text-xs font-bold text-muted-foreground mb-1">
                      Recommended instead of you
                    </p>
                    <ul className="text-sm space-y-0.5">
                      {sum.rivals.map((x) => (
                        <li key={x.name}>
                          {x.name}{" "}
                          <span className="text-muted-foreground">
                            ({x.count} of {l.total})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {sum.sites.length > 0 && (
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="text-xs font-bold text-muted-foreground mb-1">
                      Where the AI looked
                    </p>
                    <ul className="text-sm space-y-0.5">
                      {sum.sites.map((x) => (
                        <li key={x.name}>{x.name}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Being listed, with good reviews, on these sites makes you more likely to be
                      recommended.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
          <ul className="space-y-2">
            {l.results.map((r) => (
              <li key={r.question} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-start gap-2">
                  {r.named ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">"{r.question}"</p>
                    <p className="text-xs text-muted-foreground">
                      {r.named
                        ? `You were number ${r.position} of ${r.businesses.length} named.`
                        : r.businesses.length
                          ? `Named instead: ${r.businesses.slice(0, 4).join(", ")}.`
                          : "No businesses were named."}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {l && l.total === 0 && l.error && (
        <p role="alert" className="text-xs text-destructive">
          {l.error}
        </p>
      )}
    </section>
  );
}
