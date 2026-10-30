// Local rankings on the Reviews page: the searches a business tracks, and a
// grid showing where it appears on Google Maps around its base.
// No em dashes in this copy (AGENTS.md).
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import {
  addRankKeywordFn,
  checkRankNowFn,
  getRankingFn,
  removeRankKeywordFn,
  saveRankSettingsFn,
} from "../../lib/rank-tracking.functions";

type Data = Extract<Awaited<ReturnType<typeof getRankingFn>>, { ok: true }>;
type Scan = NonNullable<Data["keywords"][number]["latest"]>;

function cellTone(rank: number | null) {
  if (rank === null) return "bg-muted text-muted-foreground";
  if (rank <= 3) return "bg-emerald-500 text-white";
  if (rank <= 10) return "bg-amber-400 text-black";
  return "bg-red-500 text-white";
}

function Grid({ scan }: { scan: Scan }) {
  return (
    <div
      className="grid gap-0.5 w-fit"
      style={{ gridTemplateColumns: `repeat(${scan.gridSize}, minmax(0, 1fr))` }}
      aria-label="Position on Google Maps at each point of the grid"
    >
      {scan.points.map((p, i) => (
        <div
          key={i}
          title={p.rank === null ? "Not in the top 20" : `Number ${p.rank}`}
          className={`w-7 h-7 rounded text-[10px] font-semibold grid place-items-center ${cellTone(p.rank)}`}
        >
          {p.rank ?? "-"}
        </div>
      ))}
    </div>
  );
}

export function RankingCard() {
  const [d, setD] = useState<Data | null>(null);
  const [kw, setKw] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await getRankingFn();
    if (r.ok) setD(r);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!d || (!d.ready && d.keywords.length === 0)) return null;
  const s = d.settings;
  const run = async (
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done?: string,
  ) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (r.ok) {
      if (done) toast.success(done);
    } else toast.error(r.error || "Something went wrong.");
    await load();
  };
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Where you show on Google Maps</h2>
          <p className="text-xs text-muted-foreground">
            {s.enabled
              ? `Each search is checked once a week from a ${s.gridSize} by ${s.gridSize} grid of points ${s.spacingKm} km apart around your business.`
              : "Switch on to see where you appear on Google Maps for the searches that matter, across your area."}
          </p>
          {s.lastError && <p className="text-xs text-destructive">{s.lastError}</p>}
        </div>
        {d.canEdit && (
          <div className="flex items-center gap-2 text-xs">
            <select
              value={`${s.gridSize}|${s.spacingKm}`}
              onChange={(e) => {
                const [g, k] = e.target.value.split("|").map(Number);
                void run("grid", () =>
                  saveRankSettingsFn({ data: { enabled: s.enabled, gridSize: g!, spacingKm: k! } }),
                );
              }}
              className="rounded-lg border border-input bg-background px-2 py-1"
            >
              <option value="5|1.5">5 by 5, 1.5 km apart (town)</option>
              <option value="5|3">5 by 5, 3 km apart (wider area)</option>
              <option value="5|0.8">5 by 5, 0.8 km apart (city centre)</option>
              <option value="3|2">3 by 3, 2 km apart (cheapest)</option>
            </select>
            <label className="inline-flex items-center gap-1.5 font-semibold">
              <input
                type="checkbox"
                checked={s.enabled}
                disabled={busy !== null}
                onChange={(e) =>
                  void run(
                    "on",
                    () =>
                      saveRankSettingsFn({
                        data: {
                          enabled: e.target.checked,
                          gridSize: s.gridSize,
                          spacingKm: s.spacingKm,
                        },
                      }),
                    e.target.checked ? "Ranking checks on" : "Ranking checks off",
                  )
                }
              />
              On
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground items-center">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-500" /> Top 3
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-400" /> 4 to 10
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-500" /> 11 to 20
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-muted border border-border" /> Not in the top 20
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {d.keywords.map((k) => (
          <div key={k.id} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{k.keyword}</div>
                <div className="text-[11px] text-muted-foreground">
                  {k.latest
                    ? `Checked ${new Date(k.latest.runAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}. Shows at ${k.latest.found} of ${k.latest.points.length} points${k.latest.average !== null ? `, average position ${k.latest.average}` : ""}${k.previous?.average != null && k.latest.average !== null ? ` (was ${k.previous.average})` : ""}.`
                    : s.enabled
                      ? "First check within the hour."
                      : "Not checked yet."}
                </div>
              </div>
              {d.canEdit && (
                <button
                  type="button"
                  aria-label={`Stop tracking ${k.keyword}`}
                  onClick={() =>
                    void run(`rm-${k.id}`, () => removeRankKeywordFn({ data: { id: k.id } }))
                  }
                  className="text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {k.latest && <Grid scan={k.latest} />}
            {d.canEdit && s.enabled && k.latest && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    `now-${k.id}`,
                    () => checkRankNowFn({ data: { id: k.id } }),
                    "It will be checked within the hour",
                  )
                }
                className="text-[11px] font-semibold text-primary disabled:opacity-50"
              >
                Check again
              </button>
            )}
          </div>
        ))}
      </div>

      {d.canEdit && d.keywords.length < 5 && (
        <form
          className="flex flex-wrap gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void run("add", () => addRankKeywordFn({ data: { keyword: kw } }), "Search added").then(
              () => setKw(""),
            );
          }}
        >
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            maxLength={80}
            placeholder="A search your clients use, like cleaners newport"
            className="flex-1 min-w-[14rem] rounded-lg border border-input bg-background px-3 py-1.5"
          />
          <button
            type="submit"
            disabled={busy !== null || kw.trim().length < 2}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Track this search"}
          </button>
          <span className="basis-full text-[11px] text-muted-foreground">
            Up to 5 searches. Tip: use the words from "What people searched to find you".
          </span>
        </form>
      )}
    </section>
  );
}
