// Google Business Profile on the Reviews page: connect, reviews with reply
// drafts to approve, and Google posts. No em dashes in this copy (AGENTS.md).
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Star } from "lucide-react";
import {
  cancelGooglePostFn,
  chooseGooglePlaceFn,
  createGooglePostFn,
  disconnectGoogleFn,
  draftGoogleReplyFn,
  getGoogleFn,
  googleConnectUrlFn,
  listGooglePlacesFn,
  postGoogleReplyFn,
  refreshGoogleReviewsFn,
  saveGoogleReplySettingsFn,
  getGooglePerformanceFn,
  saveGoogleReportSettingsFn,
  sendTestGoogleReportFn,
} from "../../lib/google-business.functions";
import { change } from "../../lib/google-performance";
import { RankingCard } from "./RankingCard";
import { InsightsCard } from "./InsightsCard";
import { AiVisibilityCard } from "./AiVisibilityCard";
import { PostPlanCard } from "./PostPlanCard";
import { SocialPanel } from "./SocialPanel";

type Data = Extract<Awaited<ReturnType<typeof getGoogleFn>>, { ok: true }>;
type Review = Data["reviews"][number];

const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";

const BACK_MESSAGES: Record<string, [boolean, string]> = {
  connected: [true, "Google profile connected"],
  cancelled: [false, "Google connection was cancelled"],
  permission: [false, "Please tick the permission to manage your Business Profile and try again"],
  expired: [false, "The Google sign-in took too long. Please try again"],
  failed: [false, "Google did not connect. Please try again"],
};

export type PanelTab = "reviews" | "results" | "posts" | "settings";

export function GooglePanel({ tab }: { tab: PanelTab }) {
  const [shown, setShown] = useState(10);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await getGoogleFn();
    if (r.ok) setD(r);
    else setErr(r.error);
  }, []);
  useEffect(() => {
    void load();
    const q = new URLSearchParams(window.location.search).get("google");
    const m = q ? BACK_MESSAGES[q] : null;
    if (m) {
      if (m[0]) toast.success(m[1]);
      else toast.error(m[1]);
      const u = new URL(window.location.href);
      u.searchParams.delete("google");
      window.history.replaceState(null, "", u.toString());
    }
  }, [load]);

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
    return r.ok;
  };

  if (err) return null;
  if (!d)
    return (
      <section className="rounded-xl border border-border p-4 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading Google
      </section>
    );

  const c = d.connection;
  const needReply = d.reviews.filter((r) => !r.reply);
  const connected = c?.status === "connected";
  // The connection box: always on Settings; elsewhere only until connected.
  const showConnection = tab === "settings" || !connected;
  const list = onlyOpen && needReply.length ? needReply : d.reviews;

  return (
    <div className="space-y-4">
      {showConnection && (
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold">Google Business Profile</h2>
              <p className="text-xs text-muted-foreground">
                {!d.ready
                  ? "The Google connection is being set up. Check back soon."
                  : !c
                    ? "Connect your Google profile to see and answer your Google reviews here, publish Google posts and see what your profile brings in. Google will ask you to allow RepSuites."
                    : c.status === "connected"
                      ? `Connected to ${c.title ?? "your profile"}${c.email ? ` (${c.email})` : ""}.${c.lastSyncAt ? ` Reviews checked ${new Date(c.lastSyncAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : ""}`
                      : c.status === "choose_location"
                        ? "Choose which Google profile is this business."
                        : "Google needs connecting again."}
              </p>
              {c?.error && <p className="text-xs text-destructive mt-1">{c.error}</p>}
            </div>
            <div className="flex gap-2 text-xs">
              {d.ready && d.canConnect && (!c || c.status === "needs_reconnect") && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy("connect");
                    const r = await googleConnectUrlFn();
                    if (r.ok) window.location.href = r.url;
                    else {
                      setBusy(null);
                      toast.error(r.error);
                    }
                  }}
                  className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-semibold disabled:opacity-50"
                >
                  {busy === "connect" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : c ? (
                    "Connect again"
                  ) : (
                    "Connect Google"
                  )}
                </button>
              )}
              {c?.status === "connected" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("sync", () => refreshGoogleReviewsFn(), "Reviews checked")
                  }
                  className="inline-flex items-center gap-1 font-semibold text-primary disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busy === "sync" ? "animate-spin" : ""}`} />{" "}
                  Check now
                </button>
              )}
              {c && d.canConnect && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Disconnect Google? Your saved Google reviews are removed from here and posts stop until you connect again.",
                      )
                    )
                      void run("off", () => disconnectGoogleFn(), "Google disconnected");
                  }}
                  className="font-semibold text-muted-foreground disabled:opacity-50"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
          {c?.status === "choose_location" && d.canConnect && <ChoosePlace onDone={load} />}
        </section>
      )}

      {connected && tab === "results" && (
        <>
          <InsightsCard />
          <PerformanceCard />
          <RankingCard />
          <AiVisibilityCard />
        </>
      )}
      {connected && tab === "settings" && (
        <>
          <ReplySettingsCard s={d.replySettings} canEdit={d.canConnect} onSaved={load} />
          <ReportSettingsCard s={d.reportSettings} canEdit={d.canConnect} onSaved={load} />
        </>
      )}
      {connected && tab === "posts" && (
        <>
          <PostPlanCard
            drafts={d.posts.filter((p) => p.status === "draft")}
            business={c?.title ?? ""}
            onChanged={load}
          />
          <GooglePosts posts={d.posts.filter((p) => p.status !== "draft")} onChanged={load} />
          <SocialPanel posts={d.posts} />
        </>
      )}
      {connected && tab === "reviews" && (
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setOnlyOpen(true)}
                className={`rounded-md px-3 py-1.5 ${onlyOpen ? "bg-primary text-primary-foreground" : ""}`}
              >
                Needs a reply ({needReply.length})
              </button>
              <button
                type="button"
                onClick={() => setOnlyOpen(false)}
                className={`rounded-md px-3 py-1.5 ${!onlyOpen ? "bg-primary text-primary-foreground" : ""}`}
              >
                All ({d.reviews.length})
              </button>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run("sync", () => refreshGoogleReviewsFn(), "Reviews checked")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy === "sync" ? "animate-spin" : ""}`} /> Check
              now
            </button>
          </div>
          {d.reviews.length === 0 && (
            <p className="text-xs text-muted-foreground">No Google reviews yet.</p>
          )}
          {onlyOpen && needReply.length === 0 && d.reviews.length > 0 && (
            <p className="text-xs text-muted-foreground">Every review has a reply. Nice work.</p>
          )}
          {list.slice(0, shown).map((r) => (
            <GoogleReview key={r.id} r={r} onChanged={load} />
          ))}
          {list.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + 10)}
              className="w-full rounded-lg border border-border py-2 text-sm font-semibold"
            >
              Show more ({list.length - shown} left)
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex" aria-label={`${n} stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
        />
      ))}
    </span>
  );
}

function GoogleReview({ r, onChanged }: { r: Review; onChanged: () => Promise<void> }) {
  const [text, setText] = useState(r.draft ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  // The reply box stays closed until needed, so the list stays short on phones.
  const [open, setOpen] = useState(!!r.draft || !!r.error);
  useEffect(() => setText(r.draft ?? ""), [r.draft]);
  const draft = async () => {
    setOpen(true);
    setBusy("draft");
    const res = await draftGoogleReplyFn({ data: { id: r.id } });
    setBusy(null);
    if (res.ok) setText(res.draft);
    else toast.error(res.error);
  };
  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${!r.reply && r.stars <= 3 ? "border-destructive/40" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Stars n={r.stars} />
        <span className="font-semibold">{r.reviewer}</span>
        <span className="text-muted-foreground">{when(r.at)}</span>
      </div>
      {r.comment ? (
        <p className="text-sm whitespace-pre-line">{r.comment}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Stars only, no comment.</p>
      )}
      {r.reply && !open ? (
        <div className="rounded-md bg-muted/60 p-2 text-xs">
          <div className="font-semibold mb-0.5">
            {r.auto ? "Answered automatically" : "Your reply"}{" "}
            {r.replyAt ? `(${when(r.replyAt)})` : ""}
          </div>
          <p className="whitespace-pre-line">{r.reply}</p>
          <button
            type="button"
            onClick={() => {
              setText(r.reply ?? "");
              setOpen(true);
            }}
            className="mt-1.5 font-semibold text-primary"
          >
            Edit reply
          </button>
        </div>
      ) : !open ? (
        <div className="flex gap-3 text-xs">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-border px-3 py-1 font-semibold"
          >
            Reply
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void draft()}
            className="font-semibold text-primary disabled:opacity-50"
          >
            {busy === "draft" ? "Drafting..." : "Draft a reply"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={text ? 4 : 2}
            maxLength={4000}
            placeholder="Write a reply, or get a draft to edit"
            className={field}
          />
          {r.error && <p className="text-xs text-destructive">{r.error}</p>}
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void draft()}
              className="font-semibold text-primary disabled:opacity-50"
            >
              {busy === "draft" ? "Drafting..." : text ? "New draft" : "Draft a reply"}
            </button>
            <button
              type="button"
              disabled={busy !== null || text.trim().length < 2}
              onClick={async () => {
                setBusy("post");
                const res = await postGoogleReplyFn({ data: { id: r.id, text } });
                setBusy(null);
                if (res.ok) {
                  toast.success(r.reply ? "Reply updated on Google" : "Reply posted on Google");
                  setOpen(false);
                } else toast.error(res.error);
                await onChanged();
              }}
              className="rounded-lg bg-primary text-primary-foreground px-3 py-1 font-semibold disabled:opacity-50"
            >
              {busy === "post" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : r.reply ? (
                "Update reply on Google"
              ) : (
                "Post reply on Google"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Perf = Extract<Awaited<ReturnType<typeof getGooglePerformanceFn>>, { ok: true }>;

function Trend({ now, before }: { now: number; before: number }) {
  const c = change(now, before);
  if (c === null) return <span className="text-[11px] text-muted-foreground">new</span>;
  const tone = c > 0 ? "text-emerald-700" : c < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`text-[11px] font-semibold ${tone}`}>
      {c > 0 ? "+" : ""}
      {c}%
    </span>
  );
}

function PerformanceCard() {
  const [p, setP] = useState<Perf | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void getGooglePerformanceFn().then((r) => (r.ok ? setP(r) : setErr(r.error)));
  }, []);
  if (err) return null;
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const tiles: [string, number, number][] = p
    ? [
        ["Seen on Google Search", p.current.searchViews, p.previous.searchViews],
        ["Seen on Google Maps", p.current.mapsViews, p.previous.mapsViews],
        ["Calls", p.current.calls, p.previous.calls],
        ["Website clicks", p.current.websiteClicks, p.previous.websiteClicks],
        ["Directions asked for", p.current.directions, p.previous.directions],
        ["New reviews", p.reviews.now, p.reviews.before],
      ]
    : [];
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <h2 className="text-sm font-bold">How your Google profile is doing</h2>
        <p className="text-xs text-muted-foreground">
          {p
            ? `${fmt(p.period.split)} to ${fmt(p.period.end)}, compared with the 4 weeks before. Google's figures run a few days behind.`
            : "Loading the last 4 weeks from Google"}
        </p>
      </div>
      {!p ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tiles.map(([label, now, before]) => (
              <div key={label} className="rounded-lg border border-border p-2.5">
                <div className="text-[11px] text-muted-foreground">{label}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold">{now.toLocaleString("en-GB")}</span>
                  <Trend now={now} before={before} />
                </div>
              </div>
            ))}
          </div>
          {p.reviews.avgNow !== null && (
            <p className="text-xs text-muted-foreground">
              Average stars from new reviews: {p.reviews.avgNow}
              {p.reviews.avgBefore !== null ? ` (was ${p.reviews.avgBefore})` : ""}.
            </p>
          )}
          {p.searchTerms.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold">
                What people searched to find you ({p.searchMonth})
              </div>
              <ol className="text-xs grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
                {p.searchTerms.map((t, i) => (
                  <li key={t.term} className="flex justify-between gap-2">
                    <span className="truncate">
                      {i + 1}. {t.term}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {t.under ? `under ${t.count}` : t.count}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ReportSettingsCard({
  s,
  canEdit,
  onSaved,
}: {
  s: Data["reportSettings"];
  canEdit: boolean;
  onSaved: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(s.enabled);
  const [email, setEmail] = useState(s.email);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    setEnabled(s.enabled);
    setEmail(s.email);
  }, [s]);
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-2">
      <h2 className="text-sm font-bold">Monthly report by email</h2>
      <p className="text-xs text-muted-foreground">
        {s.enabled
          ? `On. The figures for each month go to ${s.email} on the 4th of the next month.`
          : "Off. Switch it on to get last month's Google figures by email on the 4th of each month."}
        {s.lastError ? ` Last time it could not be sent: ${s.lastError}` : ""}
      </p>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{" "}
            Send me the report
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@yourbusiness.co.uk"
            className="rounded-lg border border-input bg-background px-2 py-1 text-sm min-w-[14rem]"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("save");
              const r = await saveGoogleReportSettingsFn({ data: { enabled, email } });
              setBusy(null);
              if (r.ok) toast.success("Report settings saved");
              else toast.error(r.error);
              await onSaved();
            }}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-1 font-semibold disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
          </button>
          {s.email && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("test");
                const r = await sendTestGoogleReportFn();
                setBusy(null);
                if (r.ok) toast.success(`Last month's report sent to ${s.email}`);
                else toast.error(r.error);
              }}
              className="font-semibold text-primary disabled:opacity-50"
            >
              {busy === "test" ? "Sending..." : "Send last month's report now"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const MODES: { id: "off" | "suggest" | "auto"; label: string; help: string }[] = [
  {
    id: "off",
    label: "Off",
    help: "Nothing happens on its own. Click Draft a reply when you want one.",
  },
  {
    id: "suggest",
    label: "Suggest",
    help: "Every new review gets a draft ready. You check it and post it.",
  },
  {
    id: "auto",
    label: "Auto reply",
    help: "Replies to new good reviews are posted for you. Lower reviews get a draft for you to check first.",
  },
];

function ReplySettingsCard({
  s,
  canEdit,
  onSaved,
}: {
  s: Data["replySettings"];
  canEdit: boolean;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(s);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(s), [s]);
  const mode = MODES.find((m) => m.id === s.mode)!;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Review replies</h2>
          <p className="text-xs text-muted-foreground">
            {mode.label}
            {s.mode === "auto" ? ` for ${s.autoMinStars} stars and above` : ""}. {mode.help}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs font-semibold text-primary"
          >
            {open ? "Close" : "Change"}
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <label
                key={m.id}
                className={`rounded-lg border p-2.5 cursor-pointer ${v.mode === m.id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <span className="flex items-center gap-1.5 font-semibold text-xs">
                  <input
                    type="radio"
                    checked={v.mode === m.id}
                    onChange={() => setV({ ...v, mode: m.id })}
                  />
                  {m.label}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-1">{m.help}</span>
              </label>
            ))}
          </div>
          {v.mode === "auto" && (
            <label className="flex items-center gap-2 text-xs">
              Post automatically for
              <select
                value={v.autoMinStars}
                onChange={(e) => setV({ ...v, autoMinStars: Number(e.target.value) })}
                className="rounded-lg border border-input bg-background px-2 py-1"
              >
                <option value={5}>5 stars only</option>
                <option value={4}>4 and 5 stars</option>
                <option value={3}>3 stars and above</option>
              </select>
            </label>
          )}
          {v.mode !== "off" && (
            <p className="text-[11px] text-muted-foreground">
              Only reviews that arrive after you save are handled this way. Older reviews are left
              for you.
            </p>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-semibold">
              About your business (helps the replies sound like you)
            </span>
            <textarea
              value={v.about}
              onChange={(e) => setV({ ...v, about: e.target.value })}
              rows={2}
              maxLength={1000}
              placeholder="For example: family-run Nigerian restaurant in Newport, known for jollof and suya, owner is Tolu."
              className={field}
            />
          </label>
          <p className="text-[11px] text-muted-foreground">
            Templates: {"{name}"} becomes the reviewer's first name, {"{business}"} your business
            name and {"{stars}"} the number of stars.
          </p>
          {(
            [
              ["positive", "Good reviews (4 and 5 stars)"],
              ["neutral", "Middling reviews (3 stars)"],
              ["negative", "Poor reviews (1 and 2 stars)"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="block space-y-1">
              <span className="text-xs font-semibold">{label}</span>
              <textarea
                value={v[k]}
                onChange={(e) => setV({ ...v, [k]: e.target.value })}
                rows={3}
                maxLength={1500}
                className={field}
              />
            </label>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await saveGoogleReplySettingsFn({
                data: {
                  mode: v.mode,
                  autoMinStars: v.autoMinStars,
                  positive: v.positive,
                  neutral: v.neutral,
                  negative: v.negative,
                  about: v.about,
                },
              });
              setBusy(false);
              if (r.ok) {
                toast.success("Reply settings saved");
                setOpen(false);
              } else toast.error(r.error);
              await onSaved();
            }}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </button>
        </div>
      )}
    </section>
  );
}

// Words that say little about which business it is.
const FILLER = new Set([
  "the",
  "and",
  "ltd",
  "limited",
  "&",
  "hotel",
  "hotels",
  "suites",
  "restaurant",
]);
function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !FILLER.has(w)),
  );
}
// How alike two business names are (0 to 1), by shared words.
function likeness(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.max(x.size, y.size);
}

type Place = { account: string; location: string; title: string; address: string };

function ChoosePlace({ onDone }: { onDone: () => Promise<void> }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [business, setBusiness] = useState("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void listGooglePlacesFn().then((r) => {
      if (r.ok) {
        setPlaces(r.places);
        setBusiness(r.business ?? "");
      } else setErr(r.error);
    });
  }, []);
  if (err) return <p className="text-xs text-destructive">{err}</p>;
  if (!places) return <Loader2 className="w-4 h-4 animate-spin" />;
  if (!places.length)
    return (
      <p className="text-xs text-muted-foreground">
        No Business Profile found on this Google account. Connect with the account that manages your
        profile.
      </p>
    );
  const best =
    places
      .map((p) => ({ p, score: likeness(p.title, business) }))
      .filter((x) => x.score >= 0.5)
      .sort((a, b) => b.score - a.score)[0]?.p ?? null;
  const t = q.trim().toLowerCase();
  const shown = places.filter(
    (p) =>
      p !== best &&
      (!t || p.title.toLowerCase().includes(t) || p.address.toLowerCase().includes(t)),
  );
  const pick = async (p: Place) => {
    const r = await chooseGooglePlaceFn({ data: { account: p.account, location: p.location } });
    if (r.ok) toast.success(`Connected to ${p.title}`);
    else toast.error(r.error);
    await onDone();
  };
  const row = (p: Place, highlight = false) => (
    <button
      key={p.location}
      type="button"
      onClick={() => void pick(p)}
      className={`w-full text-left rounded-lg border px-3 py-2 text-sm hover:bg-muted/50 ${
        highlight ? "border-emerald-400 bg-emerald-50" : "border-border"
      }`}
    >
      <span className="font-semibold">{p.title}</span>
      {highlight && (
        <span className="ml-2 text-[11px] font-semibold text-emerald-800">Best match</span>
      )}
      {p.address && <span className="block text-xs text-muted-foreground">{p.address}</span>}
    </button>
  );
  return (
    <div className="space-y-2">
      {best && !t && row(best, true)}
      {places.length > 6 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${places.length} profiles by name or address`}
          className={field}
        />
      )}
      <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
        {(t &&
        best &&
        (best.title.toLowerCase().includes(t) || best.address.toLowerCase().includes(t))
          ? [best, ...shown]
          : shown
        ).map((p) => row(p))}
        {shown.length === 0 && t && (
          <p className="text-xs text-muted-foreground">No profile matches that.</p>
        )}
      </div>
    </div>
  );
}

const BUTTONS = [
  { id: "", label: "No button" },
  { id: "BOOK", label: "Book" },
  { id: "LEARN_MORE", label: "Learn more" },
  { id: "SIGN_UP", label: "Sign up" },
  { id: "CALL", label: "Call now" },
];

function GooglePosts({
  posts,
  onChanged,
}: {
  posts: Data["posts"];
  onChanged: () => Promise<void>;
}) {
  const [summary, setSummary] = useState("");
  const [action, setAction] = useState("");
  const [url, setUrl] = useState("");
  const [later, setLater] = useState(false);
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const STATUS: Record<string, string> = {
    scheduled: "Scheduled",
    posted: "Posted",
    failed: "Did not post",
  };
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <h2 className="text-sm font-bold">Google posts</h2>
        <p className="text-xs text-muted-foreground">
          Updates and offers that show on your Google profile. Regular posts help you show up in
          local searches.
        </p>
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={4}
        maxLength={1500}
        placeholder="For example: Autumn deep cleans now booking in Newport and Cwmbran. Ovens, carpets and all the corners the summer missed."
        className={field}
      />
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <select value={action} onChange={(e) => setAction(e.target.value)} className={field}>
          {BUTTONS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        {action && action !== "CALL" && (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-booking-page"
            className={field}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="inline-flex items-center gap-1.5">
          <input type="radio" checked={!later} onChange={() => setLater(false)} /> Post now
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="radio" checked={later} onChange={() => setLater(true)} /> Schedule
        </label>
        {later && (
          <input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            className="rounded-lg border border-input bg-background px-2 py-1"
          />
        )}
        <span className="text-muted-foreground">{summary.length}/1500</span>
      </div>
      <button
        type="button"
        disabled={busy || summary.trim().length < 10 || (later && !at)}
        onClick={async () => {
          setBusy(true);
          const r = await createGooglePostFn({
            data: {
              summary,
              actionType: (action || null) as "BOOK" | "LEARN_MORE" | "CALL" | "SIGN_UP" | null,
              actionUrl: action && action !== "CALL" ? url : null,
              publishAt: later && at ? new Date(at).toISOString() : null,
            },
          });
          setBusy(false);
          if (r.ok) {
            toast.success(r.posted ? "Posted on Google" : "Post scheduled");
            setSummary("");
            setUrl("");
            setAt("");
          } else toast.error(r.error);
          await onChanged();
        }}
        className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : later ? (
          "Schedule post"
        ) : (
          "Post on Google"
        )}
      </button>
      {posts.length > 0 && (
        <ul className="divide-y divide-border text-xs">
          {posts.map((p) => (
            <li key={p.id} className="py-2 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`font-semibold ${p.status === "failed" ? "text-destructive" : p.status === "posted" ? "text-emerald-700" : ""}`}
                >
                  {STATUS[p.status] ?? p.status}
                </span>
                <span className="text-muted-foreground">
                  {new Date(p.postedAt ?? p.publishAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {(p.status === "scheduled" || p.status === "failed") && (
                  <button
                    type="button"
                    onClick={async () => {
                      await cancelGooglePostFn({ data: { id: p.id } });
                      await onChanged();
                    }}
                    className="text-muted-foreground font-semibold"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="line-clamp-2">{p.summary}</p>
              {p.error && <p className="text-destructive">{p.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
