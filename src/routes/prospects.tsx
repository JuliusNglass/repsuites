// Lead generator (Accelur8 team): find a business or a niche in a town, build
// a free Google visibility report, share it, and track follow-ups.
// No em dashes in this copy (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Facebook,
  FileDown,
  Instagram,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Smartphone,
  Star,
  Trash2,
  Upload,
  Video,
  MapPin,
  MoreHorizontal,
  PhoneCall,
  RefreshCw,
} from "lucide-react";
import { Logo } from "../components/site/Logo";
import {
  buildProspectReport,
  addProspectPhrase,
  findProspectContacts,
  findProspectOwner,
  getProspect,
  listProspects,
  prospectVideoThumb,
  removeProspectVideo,
  saveProspectVideo,
  searchProspects,
  setProspectOgImage,
  startProspectUpload,
  markSent,
  undoSent,
  updateProspect,
} from "../lib/prospects.functions";
import {
  QUEUES,
  inQueue,
  londonDate,
  matchesSearch,
  opensLine,
  queueCounts,
  sendStatus,
  sortQueue,
  type QueueId,
  type SentVia,
} from "../lib/prospect-pipeline";
import {
  OPENING_QUESTION,
  VIDEO_MAX_BYTES,
  VIDEO_TYPES,
  videoExt,
  videoMessage,
  watchLabel,
} from "../lib/prospect-video";
import { makeOgCard, videoFrame } from "../lib/og-card";
import { matchesReach, PHONE_TYPE_LABEL, type ReachFilter } from "../lib/prospect-contact";
import { ownerFirstName, ownerFresh, ownerLine } from "../lib/prospect-owner";
import { money, saleOneLine, saleSymbol, type SalePeriod } from "../lib/sale-value";

export const Route = createFileRoute("/prospects")({
  head: () => ({
    meta: [{ title: "Prospects | RepSuites" }, { name: "robots", content: "noindex" }],
  }),
  component: Prospects,
});

type List = Extract<Awaited<ReturnType<typeof listProspects>>, { ok: true }>["prospects"];
type P = List[number];
type Patch = {
  stage?: (typeof STAGE_IDS)[number];
  followUpOn?: string | null;
  notes?: string;
  email?: string;
  contactName?: string;
  minSalePence?: number | null;
  salePeriod?: SalePeriod | null;
};
// The niche part of a search like "auto detailing in Newport" ("auto
// detailing"), unless the search was for this business by name.
function nicheTopic(q: string, name: string): string {
  if (q.toLowerCase().includes(name.toLowerCase().slice(0, 6))) return "";
  return q
    .replace(/\s+(in|near|around|at)\s+.*$/i, "")
    .trim()
    .slice(0, 80);
}

type Hit = Extract<Awaited<ReturnType<typeof searchProspects>>, { ok: true }>["hits"][number];

const STAGE_IDS = ["new", "sent", "opened", "replied", "booked", "won", "lost"] as const;
const STAGES: { id: (typeof STAGE_IDS)[number]; label: string }[] = [
  { id: "new", label: "New" },
  { id: "sent", label: "Sent" },
  { id: "opened", label: "Opened" },
  { id: "replied", label: "Replied" },
  { id: "booked", label: "Call booked" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

// 16px text on phones: iOS Safari zooms in on smaller inputs.
const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const fieldPlain =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-base sm:text-sm";
const FAILED = "Something went wrong. Check your connection and try again.";
// A rough check so a typo is caught here, not as a silent server error.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function scoreClass(n: number | null) {
  if (n === null) return "bg-muted text-muted-foreground";
  return n >= 75
    ? "bg-emerald-100 text-emerald-800"
    : n >= 50
      ? "bg-amber-100 text-amber-800"
      : "bg-red-100 text-red-800";
}

function shareText(
  p: { name: string; contactName?: string; topFix?: string | null; hook?: string | null },
  link: string,
) {
  const hi = p.contactName ? `Hi ${p.contactName.split(" ")[0]}` : "Hi";
  // Where they show on Google Maps leads; otherwise the report's top fix.
  const lead = p.hook || p.topFix;
  const hook = lead ? ` ${lead.replace(/\.$/, "")}.` : "";
  return `${hi}, I put together a free report on how ${p.name} shows up on Google for people searching nearby.${hook} It takes 2 minutes to read: ${link}\n\n${OPENING_QUESTION}`;
}

function shortDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// "Rebuild all" for reports with no map: at most this many per run.
const FIX_CAP = 10;

// About what one report costs: 5p to 10p, plus about 8p per extra phrase.
function reportCost(words: string) {
  const extra = Math.min(
    2,
    Math.max(
      0,
      words
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean).length - 1,
    ),
  );
  return 10 + extra * 8;
}

// Today in the UK, for follow-ups.
function today() {
  return londonDate();
}

function Prospects() {
  const list = useServerFn(listProspects);
  const search = useServerFn(searchProspects);
  const build = useServerFn(buildProspectReport);
  const addPhrase = useServerFn(addProspectPhrase);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);

  // Builds one report (plus any extra search phrases). Returns true if it worked.
  async function buildOne(
    h: { placeId: string; name: string },
    quiet = false,
    force = false,
  ): Promise<boolean> {
    setBuilding(h.placeId);
    setConfirm(null);
    try {
      // The search that found these results, not whatever is in the box now.
      const query = lastQ || q;
      const r = await build({
        data: {
          placeId: h.placeId,
          ...(force ? { force: true } : {}),
          ...(words.trim() ? { keyword: words.trim() } : {}),
          ...(area ? { area } : {}),
          niche: !query.toLowerCase().includes(h.name.toLowerCase().slice(0, 6)),
          ...(nicheTopic(query, h.name) ? { topic: nicheTopic(query, h.name) } : {}),
        },
      }).catch(() => ({ ok: false as const, error: FAILED }));
      if (r.ok) {
        // Extra search phrases: the typed ones, or (on a rebuild with none
        // typed) the ones the last report had. One at a time: 25 map
        // searches each.
        const typed = words
          .split(",")
          .map((w) => w.trim())
          .filter(Boolean)
          .slice(1, 3);
        const failed = await addExtraPhrases(
          h.placeId,
          words.trim() ? typed : (r.addPhrases ?? []),
        );
        if (failed.length && !quiet)
          toast.error(`Report built, but these phrases failed: ${failed.join(", ")}`);
        if (!quiet) toast.success(`Report ready for ${r.name}: score ${r.score}`);
        setHits(
          (cur) =>
            cur?.map((x) =>
              x.placeId === h.placeId
                ? {
                    ...x,
                    saved: true,
                    reportAt: new Date().toISOString(),
                    reportLink: `https://repsuites.com/r/${r.token}`,
                  }
                : x,
            ) ?? null,
        );
        if (!quiet) await load();
        return true;
      }
      // Built in the last 24 hours (maybe from another tab): ask first.
      if ("recent" in r && r.recent) {
        setHits(
          (cur) =>
            cur?.map((x) => (x.placeId === h.placeId ? { ...x, reportAt: r.reportAt } : x)) ?? null,
        );
        if (!quiet) setConfirm({ placeId: h.placeId, reportAt: r.reportAt });
        return false;
      }
      if (!quiet) toast.error(r.error);
      return false;
    } finally {
      setBuilding(null);
    }
  }

  // Adds each extra phrase grid in turn. Returns the phrases that failed.
  async function addExtraPhrases(placeId: string, list: string[]): Promise<string[]> {
    const failed: string[] = [];
    for (const w of list) {
      const a = await addPhrase({ data: { placeId, keyword: w } }).catch(() => null);
      if (!a?.ok) failed.push(w);
    }
    return failed;
  }

  // "Build all": up to 10 businesses shown (after the filter) without a
  // report yet, one after another. Never rebuilds one that has a report.
  async function buildAll() {
    const todo = visible.filter((h) => !h.reportLink).slice(0, 10);
    if (!todo.length) return;
    if (builtCount) toast.message(`Skipping ${builtCount} already built`);
    let ok = 0;
    setBatch({ done: 0, total: todo.length });
    try {
      for (let i = 0; i < todo.length; i++) {
        if (await buildOne(todo[i]!, true)) ok++;
        setBatch({ done: i + 1, total: todo.length });
      }
    } finally {
      setBatch(null);
    }
    await load();
    toast.success(`${ok} of ${todo.length} reports ready. They are in your Pipeline.`);
  }
  const update = useServerFn(updateProspect);
  const [tab, setTab] = useState<"find" | "pipeline" | "due">("find");
  const [items, setItems] = useState<List | null>(null);
  const [total, setTotal] = useState(0);
  const [fixPhrase, setFixPhrase] = useState("");
  const [fixing, setFixing] = useState<{ done: number; total: number } | null>(null);
  // "Rebuild all" asks first: which ones (ticked) and what it costs.
  const [fixAsk, setFixAsk] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // The query behind the results on screen.
  const [lastQ, setLastQ] = useState("");
  const [words, setWords] = useState("");
  const [area, setArea] = useState<"" | "small" | "medium" | "large">("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [nextPage, setNextPage] = useState("");
  const [moreLoading, setMoreLoading] = useState(false);
  const [building, setBuilding] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueId>("todo");
  const [term, setTerm] = useState("");
  const [reach, setReach] = useState<ReachFilter>("all");
  const [finding, setFinding] = useState<Set<string>>(new Set());
  // The inline "Rebuild?" question under one search result.
  const [confirm, setConfirm] = useState<{ placeId: string; reportAt: string } | null>(null);
  const [chEnabled, setChEnabled] = useState(true);
  const find = useServerFn(findProspectContacts);
  const searchId = useRef(0);

  // After results show: read the websites for emails and Facebook/Instagram
  // links, 8 businesses per request (the Worker may make 50 outside calls per
  // request), 2 requests at a time.
  async function findEmails(list: Hit[], id: number) {
    const todo = list.filter((h) => !h.checked && h.website);
    if (!todo.length) return;
    setFinding((cur) => new Set([...cur, ...todo.map((h) => h.placeId)]));
    const batches: Hit[][] = [];
    for (let i = 0; i < todo.length; i += 8) batches.push(todo.slice(i, i + 8));
    const run = async () => {
      while (batches.length) {
        const b = batches.shift()!;
        const r = await find({
          data: {
            items: b.map((h) => ({
              placeId: h.placeId,
              website: h.website,
              saved: h.saved,
              hasEmail: h.savedEmail,
            })),
          },
        }).catch(() => null);
        if (id !== searchId.current) return;
        const got = new Map(r?.ok ? r.found.map((f) => [f.placeId, f]) : []);
        setHits(
          (cur) =>
            cur?.map((x) => {
              if (!b.some((y) => y.placeId === x.placeId)) return x;
              const f = got.get(x.placeId);
              return {
                ...x,
                checked: true,
                email: x.email || f?.email || "",
                facebook: x.facebook || f?.facebook || "",
                instagram: x.instagram || f?.instagram || "",
              };
            }) ?? null,
        );
        setFinding((cur) => {
          const n = new Set(cur);
          b.forEach((y) => n.delete(y.placeId));
          return n;
        });
      }
    };
    await Promise.all([run(), run()]);
    // Saved prospects may have picked up an email.
    if (id === searchId.current && todo.some((h) => h.saved)) await load();
  }

  const counts = useMemo(() => {
    const all = hits ?? [];
    return {
      whatsapp: all.filter((h) => matchesReach(h, "whatsapp")).length,
      email: all.filter((h) => matchesReach(h, "email")).length,
      either: all.filter((h) => matchesReach(h, "either")).length,
    };
  }, [hits]);
  const visible = useMemo(() => (hits ?? []).filter((h) => matchesReach(h, reach)), [hits, reach]);
  const newCount = Math.min(10, visible.filter((h) => !h.reportLink).length);
  const builtCount = visible.filter((h) => h.reportLink).length;

  const loaded = useRef(false);
  const load = useCallback(async () => {
    try {
      const r = await list();
      if (r.ok) {
        loaded.current = true;
        setItems(r.prospects);
        setTotal(r.total);
        setChEnabled(r.chEnabled);
      } else setErr(r.error);
    } catch {
      // Keep what is on screen; a first load shows the error page.
      if (!loaded.current) setErr("Could not load prospects. Check your connection and reload.");
      else toast.error("Could not refresh the list. Try again.");
    }
  }, [list]);
  const one = useServerFn(getProspect);
  // After an action on one prospect: fetch just that one and swap it in.
  const refreshOne = useCallback(
    async (id: string) => {
      const r = await one({ data: { id } }).catch(() => null);
      if (r?.ok) setItems((cur) => cur?.map((x) => (x.id === id ? r.prospect : x)) ?? cur);
      else await load();
    },
    [one, load],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const due = useMemo(
    () =>
      (items ?? []).filter(
        (p) => p.followUpOn && p.followUpOn <= today() && !["won", "lost"].includes(p.stage),
      ),
    [items],
  );
  const counts2 = useMemo(() => queueCounts(items ?? []), [items]);
  const shown = useMemo(() => {
    if (tab === "due") return due;
    const list = (items ?? []).filter((p) => inQueue(p, queue) && matchesSearch(p, term));
    return sortQueue(list, queue);
  }, [tab, due, items, queue, term]);

  // Returns true when it saved.
  const save = useCallback(
    async (id: string, patch: Patch): Promise<boolean> => {
      const r = await update({ data: { id, ...patch } }).catch(() => null);
      if (!r?.ok) {
        toast.error(r && !r.ok ? r.error : FAILED);
        return false;
      }
      await refreshOne(id);
      return true;
    },
    [update, refreshOne],
  );

  if (err)
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="mb-4">{err}</p>
          <a href="/dashboard" className="underline">
            Back to the dashboard
          </a>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 h-16 flex items-center justify-between">
        <a href="/dashboard">
          <Logo />
        </a>
        <a href="/dashboard" className="text-sm text-muted-foreground">
          Dashboard
        </a>
      </header>
      <nav className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 flex gap-1 overflow-x-auto no-scrollbar">
          {(
            [
              ["find", "Find prospects"],
              ["pipeline", `Pipeline (${total || items?.length || 0})`],
              ["due", `Follow up today (${due.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`shrink-0 px-3 py-3 text-sm font-semibold border-b-2 ${
                tab === id ? "border-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
        {tab === "find" && (
          <>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (q.trim().length < 3) return;
                setSearching(true);
                const id = ++searchId.current;
                setFinding(new Set());
                setNextPage("");
                try {
                  const r = await search({ data: { q } }).catch(() => null);
                  if (r?.ok) {
                    setHits(r.hits);
                    setLastQ(q);
                    setNextPage(r.next);
                    void findEmails(r.hits, id);
                  } else toast.error(r && !r.ok ? r.error : FAILED);
                } finally {
                  setSearching(false);
                }
              }}
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="A business name, or a niche and town: dentists in Newport"
                aria-label="Search for a business, or a niche and town"
                className={field}
              />
              <button
                type="submit"
                disabled={searching}
                aria-label="Search"
                className="rounded-lg bg-primary text-primary-foreground px-4 font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {searching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Search</span>
              </button>
            </form>
            <input
              value={words}
              onChange={(e) => setWords(e.target.value)}
              placeholder="Optional: up to 3 search phrases, with commas: burger, fast food, takeaway"
              aria-label="Search phrases, up to 3, with commas"
              className={fieldPlain}
            />
            <select
              value={area}
              onChange={(e) => setArea(e.target.value as typeof area)}
              aria-label="How far customers come from"
              className={fieldPlain}
            >
              <option value="">Area to check: automatic (best for most)</option>
              <option value="small">City centre: up to 1 mile away</option>
              <option value="medium">Town shop, cafe or restaurant: up to 2 miles away</option>
              <option value="large">
                They travel to customers (cleaners, trades): up to 4 miles away
              </option>
            </select>
            <p className="text-xs text-muted-foreground">
              Each report checks the business against its nearest rivals and its Google Maps
              position. About 5p to 10p per report, plus about 8p for each extra search phrase.
            </p>
            {hits && hits.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing found. Try another search.</p>
            )}
            {hits && hits.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["whatsapp", "WhatsApp likely", counts.whatsapp],
                    ["email", "Has email", counts.email],
                    ["either", "WhatsApp or email", counts.either],
                  ] as const
                ).map(([id, label, n]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={reach === id}
                    onClick={() => setReach((cur) => (cur === id ? "all" : id))}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                      reach === id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border"
                    }`}
                  >
                    {label} ({n})
                  </button>
                ))}
                {finding.size > 0 && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="text-xs text-muted-foreground inline-flex items-center gap-1"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking for emails on{" "}
                    {finding.size} website{finding.size === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            )}
            {hits && hits.length > 0 && visible.length === 0 && !nextPage && (
              <p className="text-sm text-muted-foreground">
                None of these match the filter. Tap it again to show all.
              </p>
            )}
            {newCount > 1 && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 flex flex-wrap items-center gap-3">
                <p role="status" aria-live="polite" className="text-sm flex-1 min-w-0">
                  {batch
                    ? `Building ${batch.done + 1 > batch.total ? batch.total : batch.done + 1} of ${batch.total}. Keep this page open.`
                    : `Build reports for ${reach === "all" ? "all " : ""}${newCount} new businesses ${reach === "all" ? "here" : "shown"} in one go (about ${newCount * reportCost(words)}p).${builtCount ? ` Skipping ${builtCount} already built.` : ""}`}
                </p>
                <button
                  type="button"
                  disabled={building !== null || batch !== null}
                  onClick={() => void buildAll()}
                  className="min-h-10 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {batch && <Loader2 className="w-4 h-4 animate-spin" />}
                  Build all
                </button>
              </div>
            )}
            <ul className="space-y-2">
              {visible.map((h) => (
                <li
                  key={h.placeId}
                  className="rounded-xl border border-border bg-card p-3 flex flex-wrap items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{h.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{h.address}</p>
                    <p className="text-xs mt-0.5 inline-flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {h.rating?.toFixed(1) ?? "-"} ({h.reviews} reviews)
                      {h.category ? ` - ${h.category}` : ""}
                    </p>
                    <ReachBadges h={h} finding={finding.has(h.placeId)} />
                  </div>
                  {h.reportLink ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <p className="text-xs font-semibold text-emerald-700">
                        Report built{h.reportAt ? ` ${shortDate(h.reportAt)}` : ""}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={h.reportLink}
                          target="_blank"
                          rel="noopener"
                          className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-4 h-4" /> Open report
                        </a>
                        <button
                          type="button"
                          disabled={building !== null || batch !== null}
                          onClick={() => setConfirm({ placeId: h.placeId, reportAt: h.reportAt })}
                          className="rounded-lg px-2 py-1 text-xs text-muted-foreground underline inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {building === h.placeId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : null}
                          Rebuild
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={building !== null || batch !== null}
                      onClick={() => void buildOne(h)}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {building === h.placeId ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Build report
                    </button>
                  )}
                  {confirm?.placeId === h.placeId && (
                    <RebuildConfirm
                      reportAt={confirm.reportAt}
                      cost={reportCost(words)}
                      onYes={() => void buildOne(h, false, true)}
                      onNo={() => setConfirm(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
            {hits && nextPage && (
              <button
                type="button"
                disabled={moreLoading}
                onClick={async () => {
                  setMoreLoading(true);
                  const id = searchId.current;
                  const r = await search({ data: { q, page: nextPage } }).catch(() => null);
                  setMoreLoading(false);
                  if (id !== searchId.current) return;
                  if (!r?.ok) {
                    toast.error(r && !r.ok ? r.error : "Could not load more. Try again.");
                    return;
                  }
                  const have = new Set((hits ?? []).map((h) => h.placeId));
                  const fresh = r.hits.filter((h) => !have.has(h.placeId));
                  setHits((cur) => [...(cur ?? []), ...fresh]);
                  setNextPage(r.next);
                  void findEmails(fresh, id);
                }}
                className="w-full rounded-lg border border-border px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {moreLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Show more results ({hits.length} so far, Google gives up to 60)
              </button>
            )}
          </>
        )}

        {tab !== "find" && (
          <>
            {tab === "pipeline" &&
              (() => {
                const missing = (items ?? []).filter((p) => p.noMap);
                if (!missing.length && !fixing) return null;
                // Ticked businesses to rebuild, at most FIX_CAP per run.
                const ticked = fixAsk
                  ? missing.filter((p) => fixAsk.includes(p.id)).slice(0, FIX_CAP)
                  : [];
                const runFix = async () => {
                  const todo = ticked;
                  const phrase = fixPhrase.trim();
                  setFixAsk(null);
                  let ok = 0;
                  try {
                    for (let i = 0; i < todo.length; i++) {
                      setFixing({ done: i, total: todo.length });
                      const r = await build({
                        data: { placeId: todo[i]!.placeId, force: true, keyword: phrase },
                      }).catch(() => null);
                      if (r?.ok) ok++;
                    }
                  } finally {
                    setFixing(null);
                  }
                  setFixPhrase("");
                  if (ok === todo.length)
                    toast.success(`Added maps to ${ok} of ${todo.length} reports`);
                  else
                    toast.error(
                      `Added maps to ${ok} of ${todo.length} reports. Try the rest again.`,
                    );
                  await load();
                };
                return (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
                    <p role="status" aria-live="polite">
                      {fixing
                        ? `Adding maps: ${Math.min(fixing.done + 1, fixing.total)} of ${fixing.total}. Keep this page open.`
                        : `${missing.length} report${missing.length === 1 ? " has" : "s have"} no Google Maps grid, usually because Google gives no business category. Type what customers search for, then choose which to rebuild with that phrase (up to ${FIX_CAP} at a time).`}
                    </p>
                    {!fixing && !fixAsk && (
                      <div className="flex gap-2">
                        <input
                          value={fixPhrase}
                          onChange={(e) => setFixPhrase(e.target.value)}
                          placeholder="e.g. car detailing"
                          aria-label="Search phrase for the reports with no map"
                          className="flex-1 min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base sm:text-sm"
                        />
                        <button
                          type="button"
                          disabled={fixPhrase.trim().length < 3}
                          onClick={() => setFixAsk(missing.slice(0, FIX_CAP).map((p) => p.id))}
                          className="min-h-10 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          Rebuild {missing.length === 1 ? "it" : "all"}
                        </button>
                      </div>
                    )}
                    {!fixing && !fixAsk && (
                      <p className="text-xs text-muted-foreground">
                        {missing.map((p) => p.name).join(", ")}
                      </p>
                    )}
                    {!fixing && fixAsk && (
                      <div
                        role="alertdialog"
                        aria-label="Rebuild these reports?"
                        className="rounded-lg border border-amber-300 bg-background p-3 space-y-2"
                      >
                        <p>
                          Rebuild these with the search phrase <b>&quot;{fixPhrase.trim()}&quot;</b>{" "}
                          for every business ticked. Untick any that do not fit that phrase.
                        </p>
                        <ul className="space-y-1">
                          {missing.slice(0, FIX_CAP).map((p) => (
                            <li key={p.id}>
                              <label className="flex items-center gap-2 min-h-10">
                                <input
                                  type="checkbox"
                                  checked={fixAsk.includes(p.id)}
                                  onChange={(e) =>
                                    setFixAsk((cur) =>
                                      cur
                                        ? e.target.checked
                                          ? [...cur, p.id]
                                          : cur.filter((x) => x !== p.id)
                                        : cur,
                                    )
                                  }
                                  className="w-4 h-4"
                                />
                                <span className="min-w-0 truncate">
                                  {p.name}
                                  {p.town ? `, ${p.town}` : ""}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                        {missing.length > FIX_CAP && (
                          <p className="text-xs text-muted-foreground">
                            {missing.length - FIX_CAP} more after these. Run it again for the rest.
                          </p>
                        )}
                        <p className="font-semibold">
                          {ticked.length} report{ticked.length === 1 ? "" : "s"}, about{" "}
                          {ticked.length * reportCost(fixPhrase)}p in all.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={!ticked.length}
                            onClick={() => void runFix()}
                            className="min-h-10 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold disabled:opacity-50"
                          >
                            Rebuild {ticked.length}
                          </button>
                          <button
                            type="button"
                            onClick={() => setFixAsk(null)}
                            className="min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            {tab === "pipeline" && (
              <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                  {QUEUES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={queue === s.id}
                      onClick={() => setQueue(s.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                        queue === s.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : counts2[s.id]
                            ? "border-border"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      {s.label} ({counts2[s.id]})
                    </button>
                  ))}
                </div>
                <div className="relative sm:w-56 shrink-0">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Search name or town"
                    aria-label="Search name or town"
                    className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-1.5 text-base sm:text-sm"
                  />
                </div>
              </div>
            )}
            {items === null && <Loader2 className="w-4 h-4 animate-spin" />}
            {items && shown.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {tab === "due"
                  ? "No follow-ups due. Nice."
                  : items.length === 0
                    ? "No prospects here yet. Find some first."
                    : term.trim()
                      ? "No prospects here match your search."
                      : "Nothing here right now."}
              </p>
            )}
            {items && tab === "pipeline" && total > items.length && (
              <p className="text-xs text-muted-foreground">
                Showing the {items.length} most recently changed of {total}, plus every follow-up
                due.
              </p>
            )}
            {items && !chEnabled && <ChKeyNote />}
            <ul className="space-y-2">
              {shown.map((p) => (
                <ProspectRow
                  key={p.id}
                  p={p}
                  onSave={save}
                  onRefresh={refreshOne}
                  chEnabled={chEnabled}
                />
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

// Uploads a file straight to storage with a signed link, reporting progress.
function putFile(
  url: string,
  body: Blob,
  type: string,
  onProgress?: (pct: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", type);
    x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    x.onload = () => resolve(x.status >= 200 && x.status < 300);
    x.onerror = () => resolve(false);
    x.send(body);
  });
}

// Makes the personal link-preview picture (name, score, play button over a
// still from the video) and saves it on the prospect.
function useOgMaker() {
  const thumb = useServerFn(prospectVideoThumb);
  const start = useServerFn(startProspectUpload);
  const setOg = useServerFn(setProspectOgImage);
  return useCallback(
    async (
      p: { id: string; name: string; score: number | null },
      video: { kind: string; url: string } | null,
      localFile?: File,
    ): Promise<boolean> => {
      try {
        let still: HTMLCanvasElement | string | null = null;
        if (video?.kind === "file") still = await videoFrame(localFile ?? video.url);
        else if (video) {
          const t = await thumb({ data: { link: video.url } });
          still = t.ok ? t.thumb : null;
        }
        const blob = await makeOgCard({ name: p.name, score: p.score, video: !!video, still });
        if (!blob) return false;
        const up = await start({ data: { what: "og", ext: "jpg" } });
        if (!up.ok) return false;
        if (!(await putFile(up.uploadUrl, blob, "image/jpeg"))) return false;
        const r = await setOg({ data: { id: p.id, path: up.path } });
        return r.ok;
      } catch {
        return false;
      }
    },
    [thumb, start, setOg],
  );
}

// The "Rebuild?" question. Each report costs money, so a rebuild is never
// one tap.
function RebuildConfirm({
  reportAt,
  cost,
  onYes,
  onNo,
}: {
  reportAt: string;
  cost: number;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="Rebuild the report?"
      className="basis-full rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm flex flex-wrap items-center gap-2"
    >
      <p className="flex-1 min-w-0">
        This business already has a report{reportAt ? ` from ${shortDate(reportAt)}` : ""}.
        Rebuilding costs about {cost}p and replaces it. Rebuild?
      </p>
      <button
        type="button"
        onClick={onYes}
        className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold"
      >
        Rebuild
      </button>
      <button
        type="button"
        onClick={onNo}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold"
      >
        Cancel
      </button>
    </div>
  );
}

// Shown once (until dismissed) when the Companies House key is missing.
function ChKeyNote() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    setHidden(localStorage.getItem("rs-ch-key-note") === "1");
  }, []);
  if (hidden) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs flex items-center gap-2">
      <p className="flex-1">Add a Companies House key to look up owners.</p>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem("rs-ch-key-note", "1");
          setHidden(true);
        }}
        className="underline text-muted-foreground"
      >
        OK
      </button>
    </div>
  );
}

// Owner from Companies House (linked to the company page) or a possible
// owner named on their website, plus "Find owner" for UK businesses.
function OwnerInfo({
  p,
  chEnabled,
  onRefresh,
}: {
  p: P;
  chEnabled: boolean;
  onRefresh: (id: string) => Promise<void>;
}) {
  const findOwner = useServerFn(findProspectOwner);
  const [busy, setBusy] = useState(false);
  const line = ownerLine(p);
  const hasCh = p.ownerSource === "companies_house";
  const canFind = chEnabled && p.uk && !hasCh && !ownerFresh(p.ownerLookedUpAt);
  const notFound = chEnabled && p.uk && !hasCh && ownerFresh(p.ownerLookedUpAt);
  if (!line && !canFind && !notFound) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs mt-0.5">
      {line &&
        (line.href ? (
          <a
            href={line.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:underline"
          >
            {line.label}
          </a>
        ) : (
          <span className="font-semibold">{line.label}</span>
        ))}
      {line && (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${
            line.sure ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"
          }`}
        >
          {line.source}
        </span>
      )}
      {notFound && <span className="text-muted-foreground">Not found on Companies House</span>}
      {canFind && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await findOwner({ data: { id: p.id } }).catch(() => null);
              if (!r?.ok) {
                toast.error(r && !r.ok ? r.error : FAILED);
                return;
              }
              if (!r.found) toast.message("No matching company on Companies House");
              await onRefresh(p.id);
            } finally {
              setBusy(false);
            }
          }}
          className="min-h-8 rounded-lg border border-border px-2 py-0.5 inline-flex items-center gap-1 disabled:opacity-50"
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />} Find owner
        </button>
      )}
    </div>
  );
}

const ProspectRow = memo(function ProspectRow({
  p,
  onSave,
  onRefresh,
  chEnabled,
}: {
  p: P;
  onSave: (id: string, patch: Patch) => Promise<boolean>;
  onRefresh: (id: string) => Promise<void>;
  chEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [rebuild, setRebuild] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [phrases, setPhrases] = useState(p.phrases);
  const build = useServerFn(buildProspectReport);
  const addPhrase = useServerFn(addProspectPhrase);
  // Rebuild from the pipeline: no new search needed. The first phrase runs
  // with the report; any others are added one at a time (25 map checks each).
  // With the box cleared, the server keeps the last report's phrases and
  // hands back the extra ones to add.
  const runRebuild = async () => {
    setRebuilding(true);
    try {
      const list = phrases
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean)
        .slice(0, 3);
      const r = await build({
        data: {
          placeId: p.placeId,
          force: true,
          ...(list[0] ? { keyword: list[0] } : {}),
        },
      }).catch(() => ({ ok: false as const, error: FAILED }));
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const failed: string[] = [];
      for (const w of list.length ? list.slice(1) : (r.addPhrases ?? [])) {
        const a = await addPhrase({ data: { placeId: p.placeId, keyword: w } }).catch(() => null);
        if (!a?.ok) failed.push(w);
      }
      setRebuild(false);
      if (failed.length)
        toast.error(`Rebuilt ${p.name}, but these phrases failed: ${failed.join(", ")}`);
      else toast.success(`Rebuilt the report for ${p.name}`);
      await onRefresh(p.id);
    } finally {
      setRebuilding(false);
    }
  };
  const [notes, setNotes] = useState(p.notes);
  const [email, setEmail] = useState(p.email);
  const [contact, setContact] = useState(p.contactName);
  // "What 1 more customer is worth" on the report: blank uses the default.
  const [minSale, setMinSale] = useState(
    p.minSalePence ? String(Math.round(p.minSalePence / 100)) : "",
  );
  const [salePeriod, setSalePeriod] = useState<SalePeriod>(p.salePeriod ?? p.saleDefault.period);
  const makeOg = useOgMaker();
  const hasVideo = !!p.videoUrl;
  // Greet the owner by first name when we know it and no contact is typed in.
  const greet = {
    ...p,
    contactName: p.contactName || ownerFirstName(p.owners, p.websiteOwnerName),
  };
  const text = p.link ? (hasVideo ? videoMessage(greet, p.link) : shareText(greet, p.link)) : "";
  const emailText =
    p.link && hasVideo
      ? videoMessage(greet, p.link, true)
      : text
        ? `${text}\n\nReply STOP and I won't message again.`
        : "";
  const emailSubject = hasVideo
    ? `A quick video about ${p.name} on Google`
    : `How ${p.name} shows up on Google`;
  const watched = watchLabel(p.videoFirstPlayedAt, p.videoMaxPercent);
  const mark = useServerFn(markSent);
  const undo = useServerFn(undoSent);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [undoAsk, setUndoAsk] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const closeMore = () => setMoreOpen(false);
  // The More menu closes on a tap outside it or Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const down = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [moreOpen]);
  // Makes the link-preview picture if there is none yet.
  const ensureOg = () => {
    if (!p.ogImage)
      void makeOg(
        p,
        p.videoUrl && p.videoKind ? { kind: p.videoKind, url: p.videoUrl } : null,
      ).then((ok) => (ok ? onRefresh(p.id) : undefined));
  };
  // The message really went out: records how and when, moves a new prospect
  // to Sent and sets a follow-up in 3 days.
  const sent = async (via: SentVia) => {
    ensureOg();
    setCopied(false);
    if (p.sentAt) return;
    const r = await mark({ data: { id: p.id, via } }).catch(() => ({
      ok: false as const,
      error: "Could not save. Try again.",
    }));
    if (!r.ok) toast.error(r.error);
    await onRefresh(p.id);
  };
  const undoSend = async () => {
    setUndoAsk(false);
    const r = await undo({ data: { id: p.id } }).catch(() => ({
      ok: false as const,
      error: "Could not save. Try again.",
    }));
    if (!r.ok) toast.error(r.error);
    else toast.success("Marked as not sent");
    await onRefresh(p.id);
  };
  const status = sendStatus(p);
  const opensText = opensLine(p);
  const phone = p.phone.replace(/[^\d+]/g, "");
  const wa = p.waDigits || (phone.startsWith("+") ? phone.slice(1) : "");
  const noWhatsApp = p.phoneType === "landline" || p.phoneType === "none" || !wa;
  const noWaTitle =
    p.phoneType === "none" || !phone
      ? "No phone number"
      : p.phoneType === "landline"
        ? "This looks like a landline"
        : "Could not read this number for WhatsApp";
  // 40px tall: easy to tap on a phone.
  const btn =
    "min-h-10 rounded-lg border border-border px-3 py-1.5 inline-flex items-center gap-1.5";
  const off = `${btn} opacity-40 cursor-not-allowed`;
  const item =
    "min-h-10 rounded-md px-2.5 py-2 inline-flex items-center gap-1.5 hover:bg-muted text-left";
  const noEmail = !p.email;
  const noText = !phone;
  return (
    <li className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 rounded-lg px-2 py-1 text-sm font-bold ${scoreClass(p.score)}`}>
          {p.score ?? "-"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{p.name}</p>
          <p className="text-xs mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold ${
                status.tone === "green"
                  ? "bg-emerald-100 text-emerald-800"
                  : status.tone === "amber"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {status.text}
            </span>
            {status.sent && !undoAsk && (
              <button
                type="button"
                onClick={() => setUndoAsk(true)}
                title="It was not really sent. Clears the send and any opens."
                className="underline text-muted-foreground py-1"
              >
                Undo
              </button>
            )}
            {opensText && (
              <span
                className={
                  opensText.startsWith("Opened")
                    ? "font-semibold text-emerald-700"
                    : "text-muted-foreground"
                }
              >
                {opensText}
              </span>
            )}
          </p>
          {undoAsk && (
            <div
              role="alertdialog"
              aria-label="Undo sent?"
              className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs flex flex-wrap items-center gap-2"
            >
              <span>This clears the sent time and opens. Undo?</span>
              <button
                type="button"
                onClick={() => void undoSend()}
                className="min-h-8 rounded-lg bg-primary text-primary-foreground px-2.5 font-semibold"
              >
                Undo sent
              </button>
              <button
                type="button"
                onClick={() => setUndoAsk(false)}
                className="min-h-8 underline text-muted-foreground"
              >
                Keep it
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {p.town}
            {p.followUpOn
              ? ` - follow up ${new Date(p.followUpOn).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
              : ""}
            {p.source === "inbound" ? " - asked for a check" : ""}
            {p.googleConnected ? " - connected Google" : ""}
          </p>
          {watched && (
            <p className="text-xs mt-0.5 font-semibold text-emerald-700 inline-flex items-center gap-1">
              <Video className="w-3.5 h-3.5" /> {watched}
            </p>
          )}
          {p.topFix && <p className="text-xs mt-0.5 truncate">{p.topFix}</p>}
          <OwnerInfo p={p} chEnabled={chEnabled} onRefresh={onRefresh} />
          <ReachBadges
            h={{
              phoneType: p.phoneType,
              email: p.email,
              facebook: p.facebook,
              instagram: p.instagram,
            }}
            finding={false}
          />
        </div>
        <select
          value={p.stage}
          aria-label={`Stage for ${p.name}`}
          onChange={(e) =>
            void onSave(p.id, { stage: e.target.value as (typeof STAGE_IDS)[number] })
          }
          className="shrink-0 min-h-10 rounded-lg border border-input bg-background px-2 py-1 text-base sm:text-xs"
        >
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {p.link && (
        <div className="flex flex-wrap gap-1.5 text-sm sm:text-xs">
          {noWhatsApp ? (
            <span title={noWaTitle} className={off} aria-disabled="true">
              <MessageCircle className="w-4 h-4" /> WhatsApp
              <span className="sr-only">: {noWaTitle}</span>
            </span>
          ) : (
            <a
              href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noopener"
              onClick={() => void sent("whatsapp")}
              title={
                p.phoneType === "mobile"
                  ? "Mobile number: very likely on WhatsApp. Opens the message and marks it as sent."
                  : "Opens the message in WhatsApp and marks it as sent"
              }
              className="min-h-10 rounded-lg bg-emerald-600 text-white px-3 py-1.5 inline-flex items-center gap-1.5 font-semibold"
            >
              <MessageCircle className="w-4 h-4" /> Send on WhatsApp
            </a>
          )}
          {noEmail ? (
            <span title="No email saved. Add one in Details." className={off} aria-disabled="true">
              <Mail className="w-4 h-4" /> Email
              <span className="sr-only">: No email saved. Add one in Details.</span>
            </span>
          ) : (
            <a
              title={`Email ${p.email}`}
              href={`mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailText)}`}
              onClick={() => void sent("email")}
              className={btn}
            >
              <Mail className="w-4 h-4" /> Email
            </a>
          )}
          {noText ? (
            <span title="No phone number" className={off} aria-disabled="true">
              <Smartphone className="w-4 h-4" /> Text
              <span className="sr-only">: No phone number</span>
            </span>
          ) : (
            <a
              href={`sms:${phone}?&body=${encodeURIComponent(text)}`}
              onClick={() => void sent("text")}
              className={btn}
            >
              <Smartphone className="w-4 h-4" /> Text
            </a>
          )}
          <a href={p.link} target="_blank" rel="noopener" className={btn}>
            <ExternalLink className="w-4 h-4" /> Open
          </a>
          <button
            type="button"
            onClick={() => setVideoOpen((v) => !v)}
            aria-expanded={videoOpen}
            className={`${btn} ${hasVideo ? "border-emerald-600 text-emerald-700" : ""}`}
          >
            <Video className="w-4 h-4" /> {hasVideo ? "Video added" : "Add video"}
          </button>
          <div ref={moreRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
              className={btn}
            >
              <MoreHorizontal className="w-4 h-4" /> More
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute z-20 mt-1 right-0 min-w-48 rounded-lg border border-border bg-card shadow-lg p-1 flex flex-col"
              >
                {!noWhatsApp && (
                  <a
                    role="menuitem"
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noopener"
                    onClick={closeMore}
                    title="Open their WhatsApp chat without a message, to see if the number is on WhatsApp"
                    className={item}
                  >
                    <PhoneCall className="w-4 h-4" /> Check WhatsApp
                  </a>
                )}
                {p.mapsUrl && (
                  <a
                    role="menuitem"
                    href={p.mapsUrl}
                    target="_blank"
                    rel="noopener"
                    onClick={closeMore}
                    title="Their Google Business Profile on Google Maps"
                    className={item}
                  >
                    <MapPin className="w-4 h-4" /> Google profile
                  </a>
                )}
                <a
                  role="menuitem"
                  href={`${p.link}?print=1`}
                  target="_blank"
                  rel="noopener"
                  onClick={closeMore}
                  title="Opens the report ready to save as a PDF"
                  className={item}
                >
                  <FileDown className="w-4 h-4" /> PDF
                </a>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMore();
                    // Start from the phrases the report has now.
                    if (!rebuild) setPhrases(p.phrases);
                    setRebuild((v) => !v);
                  }}
                  title="Run the report again with fresh Google figures"
                  className={item}
                >
                  <RefreshCw className="w-4 h-4" /> Rebuild report
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    closeMore();
                    try {
                      await navigator.clipboard.writeText(text);
                    } catch {
                      toast.error("Could not copy. Try again.");
                      return;
                    }
                    toast.success("Message and link copied");
                    ensureOg();
                    if (!p.sentAt) setCopied(true);
                  }}
                  className={item}
                >
                  <Copy className="w-4 h-4" /> Copy message
                </button>
                {!p.sentAt && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMore();
                      void sent("manual");
                    }}
                    className={item}
                  >
                    <Check className="w-4 h-4" /> Mark as sent
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              // Opening shows what is saved now (the list may have changed).
              if (!open) {
                setNotes(p.notes);
                setEmail(p.email);
                setContact(p.contactName);
              }
              setOpen((v) => !v);
            }}
            aria-expanded={open}
            className="min-h-10 ml-auto px-2 py-1.5 inline-flex items-center gap-1 text-muted-foreground"
          >
            Details {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      )}
      {copied && !p.sentAt && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs flex flex-wrap items-center gap-2">
          <span>Did you send it?</span>
          <button
            type="button"
            onClick={() => void sent("copy")}
            className="min-h-8 rounded-lg bg-primary text-primary-foreground px-2.5 py-1 font-semibold inline-flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" /> Mark as sent
          </button>
          <button
            type="button"
            onClick={() => setCopied(false)}
            className="min-h-8 underline text-muted-foreground"
          >
            Not yet
          </button>
        </div>
      )}
      {rebuild && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
          <p>
            Rebuild the report for <b>{p.name}</b> with fresh Google figures
            {p.reportAt ? ` (last built ${shortDate(p.reportAt)})` : ""}. It costs about{" "}
            {reportCost(phrases || p.phrases)}p and replaces the current one, at the same link.
            Leave the phrases empty to keep the ones it has.
          </p>
          <input
            value={phrases}
            onChange={(e) => setPhrases(e.target.value)}
            placeholder="Search phrases, with commas: car valeting, car wash"
            aria-label="Search phrases for the rebuild, with commas"
            className={fieldPlain}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={rebuilding}
              onClick={() => void runRebuild()}
              className="min-h-10 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {rebuilding && <Loader2 className="w-4 h-4 animate-spin" />}
              {rebuilding ? "Rebuilding (about a minute)" : "Rebuild"}
            </button>
            <button
              type="button"
              disabled={rebuilding}
              onClick={() => setRebuild(false)}
              className="min-h-10 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {videoOpen && p.link && <VideoPanel p={p} makeOg={makeOg} onRefresh={onRefresh} />}
      {open && (
        <div className="grid sm:grid-cols-2 gap-2 pt-1">
          <label className="text-xs space-y-1">
            <span className="sr-only">Contact name</span>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Contact name"
              autoComplete="off"
              className={field}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="sr-only">Email</span>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="off"
              className={field}
            />
          </label>
          <label className="text-xs space-y-1 sm:col-span-2">
            <span className="font-semibold">Follow up on</span>
            <input
              type="date"
              value={p.followUpOn ?? ""}
              onChange={(e) => void onSave(p.id, { followUpOn: e.target.value || null })}
              className={field}
            />
          </label>
          <label className="text-xs space-y-1 sm:col-span-2">
            <span className="sr-only">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Notes"
              className={field}
            />
          </label>
          <MinSaleField
            p={p}
            value={minSale}
            period={salePeriod}
            onValue={setMinSale}
            onPeriod={setSalePeriod}
          />
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              if (email.trim() && !EMAIL_RE.test(email.trim())) {
                toast.error("That email does not look right. Check it and try again.");
                return;
              }
              setSaving(true);
              try {
                const ok = await onSave(p.id, {
                  notes,
                  email: email.trim(),
                  contactName: contact,
                  ...saleSave(minSale, salePeriod, p.saleDefault.period),
                });
                if (ok) toast.success("Saved");
              } finally {
                setSaving(false);
              }
            }}
            className="min-h-10 rounded-lg bg-primary text-primary-foreground font-semibold px-3 py-2 text-sm sm:col-span-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save details
          </button>
          {p.phone && (
            <p className="text-xs text-muted-foreground sm:col-span-2">Phone: {p.phone}</p>
          )}
        </div>
      )}
    </li>
  );
});

// Whole pounds typed in, saved as pence. Blank and the default period means
// "use the default for the niche".
function saleSave(
  typed: string,
  period: SalePeriod,
  defaultPeriod: SalePeriod,
): { minSalePence: number | null; salePeriod: SalePeriod | null } {
  const n = Math.round(Number(typed));
  const amount = typed.trim() && n > 0 ? n : null;
  return {
    minSalePence: amount === null ? null : amount * 100,
    salePeriod: amount === null && period === defaultPeriod ? null : period,
  };
}

// "Minimum sale" for the "What 1 more customer is worth" part of the report.
function MinSaleField({
  p,
  value,
  period,
  onValue,
  onPeriod,
}: {
  p: P;
  value: string;
  period: SalePeriod;
  onValue: (v: string) => void;
  onPeriod: (v: SalePeriod) => void;
}) {
  const cur = p.saleCurrency;
  const def = p.saleDefault;
  const n = Math.round(Number(value));
  const amount = value.trim() && n > 0 ? n : def.amount;
  return (
    <div className="text-xs space-y-1 sm:col-span-2">
      <span className="font-semibold">Minimum sale</span>
      <div className="flex gap-2">
        <div className="flex flex-1 items-center rounded-lg border border-input bg-background px-3">
          <span className="text-sm text-muted-foreground">{saleSymbol(cur)}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={value}
            onChange={(e) => onValue(e.target.value.replace(/[^\d]/g, ""))}
            placeholder={String(def.amount)}
            aria-label="Minimum sale"
            className="w-full bg-transparent px-1 py-2 text-sm outline-none"
          />
        </div>
        <select
          value={period}
          onChange={(e) => onPeriod(e.target.value as SalePeriod)}
          aria-label="Per day or per week"
          className="rounded-lg border border-input bg-background px-2 py-2 text-sm"
        >
          <option value="day">per day</option>
          <option value="week">per week</option>
        </select>
      </div>
      <p className="text-muted-foreground">
        {value.trim()
          ? `The default for ${def.niche} is ${money(def.amount, cur)} a ${def.period}. Clear the box to use it.`
          : `Using ${money(def.amount, cur)} a ${period} for ${def.niche}.`}
      </p>
      <p className="font-semibold">{saleOneLine(amount, period, cur)}</p>
    </div>
  );
}

// Add, replace or remove the personal video shown at the top of the report.
function VideoPanel({
  p,
  makeOg,
  onRefresh,
}: {
  p: P;
  makeOg: ReturnType<typeof useOgMaker>;
  onRefresh: (id: string) => Promise<void>;
}) {
  const save = useServerFn(saveProspectVideo);
  const remove = useServerFn(removeProspectVideo);
  const start = useServerFn(startProspectUpload);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pct, setPct] = useState<number | null>(null);

  async function finish(video: { kind: string; url: string }, file?: File) {
    setBusy("Making the link preview picture");
    try {
      const ok = await makeOg(p, video, file);
      if (!ok) toast.message("Video saved. The preview picture will be made when you share.");
      else toast.success("Video saved. It now shows at the top of the report.");
    } finally {
      setBusy(null);
    }
    setLink("");
    await onRefresh(p.id);
  }

  async function saveLink() {
    if (!link.trim()) return;
    setBusy("Saving");
    const r = await save({ data: { id: p.id, link: link.trim() } }).catch(() => null);
    if (!r?.ok) {
      setBusy(null);
      toast.error(r?.error ?? "Something went wrong. Try again.");
      return;
    }
    await finish({ kind: r.kind, url: r.url });
  }

  async function upload(file: File) {
    const ext = videoExt(file.name, file.type);
    if (!ext) {
      toast.error("Use an mp4, mov or webm video.");
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      toast.error("That video is over 200 MB. Record a shorter one, or use a Loom link.");
      return;
    }
    setBusy("Uploading");
    setPct(0);
    const up = await start({ data: { what: "video", ext } }).catch(() => null);
    if (!up?.ok) {
      setBusy(null);
      setPct(null);
      toast.error(up?.error ?? "Could not start the upload. Try again.");
      return;
    }
    const type = file.type || VIDEO_TYPES[ext]!;
    const ok = await putFile(up.uploadUrl, file, type, setPct);
    setPct(null);
    if (!ok) {
      setBusy(null);
      toast.error("The upload failed. Check your connection and try again.");
      return;
    }
    setBusy("Saving");
    const r = await save({ data: { id: p.id, path: up.path } }).catch(() => null);
    if (!r?.ok) {
      setBusy(null);
      toast.error(r?.error ?? "Something went wrong. Try again.");
      return;
    }
    await finish({ kind: r.kind, url: r.url }, file);
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
      {p.videoUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            {p.videoKind === "file"
              ? "Uploaded video"
              : `${(p.videoKind ?? "").replace(/^./, (c) => c.toUpperCase())} video`}
          </span>
          <a href={p.videoUrl} target="_blank" rel="noopener" className="underline text-xs">
            Watch
          </a>
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("Removing");
              try {
                const r = await remove({ data: { id: p.id } }).catch(() => null);
                if (!r?.ok) {
                  toast.error(r?.error ?? "Could not remove the video.");
                  return;
                }
                toast.success("Video removed");
              } finally {
                setBusy(null);
              }
              await onRefresh(p.id);
            }}
            className="ml-auto min-h-10 rounded-lg border border-border px-3 py-1 text-xs inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Record a short screen video walking through their report. It shows at the top of their
          report link, with a Start free button under it.
        </p>
      )}
      <div className="flex gap-2">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Paste a Loom, YouTube or Vimeo link"
          aria-label="Video link: Loom, YouTube or Vimeo"
          className={field}
        />
        <button
          type="button"
          disabled={busy !== null || !link.trim()}
          onClick={() => void saveLink()}
          className="min-h-10 rounded-lg bg-primary text-primary-foreground px-3 font-semibold disabled:opacity-50"
        >
          {p.videoUrl ? "Replace" : "Save"}
        </button>
      </div>
      <label
        className={`min-h-10 rounded-lg border border-dashed border-border px-3 py-2 flex items-center gap-2 cursor-pointer focus-within:ring-2 focus-within:ring-primary/40 ${
          busy ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <Upload className="w-4 h-4" />
        <span>Or upload a video file (mp4, mov or webm, up to 200 MB)</span>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          disabled={busy !== null}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </label>
      {busy && (
        <div role="status" aria-live="polite" className="space-y-1">
          <p className="text-xs inline-flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {busy}
            {pct !== null ? ` ${pct}%` : ""}. Keep this page open.
          </p>
          {pct !== null && (
            <div className="h-2 rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Small badges: mobile (WhatsApp likely) or landline, email found (the
// address shows on hover or tap), and Facebook/Instagram links for a DM.
function ReachBadges({
  h,
  finding,
}: {
  h: { phoneType: P["phoneType"]; email: string; facebook: string; instagram: string };
  finding: boolean;
}) {
  const [showEmail, setShowEmail] = useState(false);
  const pill = "rounded-full px-2 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1";
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {h.phoneType === "mobile" && (
        <span
          className={`${pill} bg-emerald-100 text-emerald-800`}
          title="A mobile number, so very likely on WhatsApp"
        >
          <MessageCircle className="w-3 h-3" /> WhatsApp likely
        </span>
      )}
      {h.phoneType === "landline" && (
        <span
          className={`${pill} bg-muted text-muted-foreground`}
          title="A landline, so not on WhatsApp"
        >
          <Phone className="w-3 h-3" /> Landline
        </span>
      )}
      {h.phoneType === "unknown" && (
        <span
          className={`${pill} bg-muted text-muted-foreground`}
          title="We cannot tell mobiles from landlines in this country"
        >
          <Phone className="w-3 h-3" /> {PHONE_TYPE_LABEL.unknown}
        </span>
      )}
      {h.phoneType === "none" && (
        <span className={`${pill} bg-muted text-muted-foreground`}>{PHONE_TYPE_LABEL.none}</span>
      )}
      {h.email && (
        <button
          type="button"
          title={h.email}
          onClick={() => setShowEmail((v) => !v)}
          className={`${pill} bg-sky-100 text-sky-800`}
        >
          <Mail className="w-3 h-3" /> {showEmail ? h.email : "Email found"}
        </button>
      )}
      {finding && (
        <span className={`${pill} text-muted-foreground`}>
          <Loader2 className="w-3 h-3 animate-spin" /> Looking for email
        </span>
      )}
      {h.facebook && (
        <a
          href={h.facebook}
          target="_blank"
          rel="noopener noreferrer"
          title="Facebook page"
          aria-label="Facebook page"
          className="text-[#1877F2]"
        >
          <Facebook className="w-4 h-4" />
        </a>
      )}
      {h.instagram && (
        <a
          href={h.instagram}
          target="_blank"
          rel="noopener noreferrer"
          title="Instagram"
          aria-label="Instagram"
          className="text-[#C13584]"
        >
          <Instagram className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}
