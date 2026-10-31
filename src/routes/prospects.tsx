// Lead generator (Accelur8 team): find a business or a niche in a town, build
// a free Google visibility report, share it, and track follow-ups.
// No em dashes in this copy (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
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
} from "lucide-react";
import { Logo } from "../components/site/Logo";
import {
  buildProspectReport,
  addProspectPhrase,
  findProspectContacts,
  listProspects,
  prospectVideoThumb,
  removeProspectVideo,
  saveProspectVideo,
  searchProspects,
  setProspectOgImage,
  startProspectUpload,
  updateProspect,
} from "../lib/prospects.functions";
import {
  VIDEO_MAX_BYTES,
  VIDEO_TYPES,
  videoExt,
  videoMessage,
  watchLabel,
} from "../lib/prospect-video";
import { makeOgCard, videoFrame } from "../lib/og-card";
import { matchesReach, PHONE_TYPE_LABEL, type ReachFilter } from "../lib/prospect-contact";

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
};
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

const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

function scoreClass(n: number | null) {
  if (n === null) return "bg-muted text-muted-foreground";
  return n >= 75
    ? "bg-emerald-100 text-emerald-800"
    : n >= 50
      ? "bg-amber-100 text-amber-800"
      : "bg-red-100 text-red-800";
}

function shareText(
  p: { name: string; contactName?: string; topFix?: string | null },
  link: string,
) {
  const hi = p.contactName ? `Hi ${p.contactName.split(" ")[0]}` : "Hi";
  // The report's most important finding makes the message personal.
  const hook = p.topFix ? ` The first thing I noticed: ${p.topFix.replace(/\.$/, "")}.` : "";
  return `${hi}, I put together a free report on how ${p.name} shows up on Google Maps, compared with the businesses nearest to you.${hook} It takes 2 minutes to read: ${link}`;
}

function today(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

function Prospects() {
  const list = useServerFn(listProspects);
  const search = useServerFn(searchProspects);
  const build = useServerFn(buildProspectReport);
  const addPhrase = useServerFn(addProspectPhrase);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);

  // Builds one report (plus any extra search phrases). Returns true if it worked.
  async function buildOne(h: { placeId: string; name: string }, quiet = false): Promise<boolean> {
    setBuilding(h.placeId);
    const r = await build({
      data: {
        placeId: h.placeId,
        ...(words.trim() ? { keyword: words.trim() } : {}),
        ...(area ? { area } : {}),
        niche: !q.toLowerCase().includes(h.name.toLowerCase().slice(0, 6)),
      },
    }).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    // Extra search phrases: one at a time (each is 25 map searches).
    const extra = words
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean)
      .slice(1, 3);
    if (r.ok)
      for (const w of extra) {
        const a = await addPhrase({ data: { placeId: h.placeId, keyword: w } });
        if (!a.ok && !quiet) toast.error(`"${w}": ${a.error}`);
      }
    setBuilding(null);
    if (r.ok) {
      if (!quiet) toast.success(`Report ready for ${r.name}: score ${r.score}`);
      setHits(
        (cur) => cur?.map((x) => (x.placeId === h.placeId ? { ...x, saved: true } : x)) ?? null,
      );
      if (!quiet) await load();
      return true;
    }
    if (!quiet) toast.error(r.error);
    return false;
  }

  // "Build all": up to 10 businesses shown (after the filter) without a
  // report yet, one after another.
  async function buildAll() {
    const todo = visible.filter((h) => !h.saved).slice(0, 10);
    if (!todo.length) return;
    let ok = 0;
    setBatch({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      if (await buildOne(todo[i]!, true)) ok++;
      setBatch({ done: i + 1, total: todo.length });
    }
    setBatch(null);
    await load();
    toast.success(`${ok} of ${todo.length} reports ready. They are in your Pipeline.`);
  }
  const update = useServerFn(updateProspect);
  const [tab, setTab] = useState<"find" | "pipeline" | "due">("find");
  const [items, setItems] = useState<List | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [words, setWords] = useState("");
  const [area, setArea] = useState<"" | "small" | "medium" | "large">("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [nextPage, setNextPage] = useState("");
  const [moreLoading, setMoreLoading] = useState(false);
  const [building, setBuilding] = useState<string | null>(null);
  const [stage, setStage] = useState<string>("all");
  const [reach, setReach] = useState<ReachFilter>("all");
  const [finding, setFinding] = useState<Set<string>>(new Set());
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
  const newCount = Math.min(10, visible.filter((h) => !h.saved).length);

  const load = useCallback(async () => {
    const r = await list();
    if (r.ok) setItems(r.prospects);
    else setErr(r.error);
  }, [list]);
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
  const shown = useMemo(
    () => (tab === "due" ? due : (items ?? []).filter((p) => stage === "all" || p.stage === stage)),
    [tab, due, items, stage],
  );

  const save = async (id: string, patch: Patch) => {
    const r = await update({ data: { id, ...patch } });
    if (!r.ok) toast.error(r.error);
    await load();
  };

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
              ["pipeline", `Pipeline (${items?.length ?? 0})`],
              ["due", `Follow up today (${due.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
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
                const r = await search({ data: { q } });
                setSearching(false);
                if (r.ok) {
                  setHits(r.hits);
                  setNextPage(r.next);
                  void findEmails(r.hits, id);
                } else toast.error(r.error);
              }}
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="A business name, or a niche and town: dentists in Newport"
                className={field}
              />
              <button
                type="submit"
                disabled={searching}
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
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <select
              value={area}
              onChange={(e) => setArea(e.target.value as typeof area)}
              aria-label="How far customers come from"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
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
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
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
            {visible.filter((h) => !h.saved).length > 1 && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 flex flex-wrap items-center gap-3">
                <p className="text-sm flex-1 min-w-0">
                  {batch
                    ? `Building ${batch.done + 1 > batch.total ? batch.total : batch.done + 1} of ${batch.total}. Keep this page open.`
                    : `Build reports for ${reach === "all" ? "all " : ""}${newCount} new businesses ${reach === "all" ? "here" : "shown"} in one go (about ${newCount * 10}p).`}
                </p>
                <button
                  type="button"
                  disabled={building !== null || batch !== null}
                  onClick={() => void buildAll()}
                  className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
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
                  <button
                    type="button"
                    disabled={building !== null}
                    onClick={() => void buildOne(h)}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {building === h.placeId ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {h.saved ? "Rebuild report" : "Build report"}
                  </button>
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
            {tab === "pipeline" && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {[{ id: "all", label: "All" }, ...STAGES].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStage(s.id)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold border ${
                      stage === s.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {items === null && <Loader2 className="w-4 h-4 animate-spin" />}
            {items && shown.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {tab === "due"
                  ? "No follow-ups due. Nice."
                  : "No prospects here yet. Find some first."}
              </p>
            )}
            <ul className="space-y-2">
              {shown.map((p) => (
                <ProspectRow key={p.id} p={p} onSave={save} onReload={load} />
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

function ProspectRow({
  p,
  onSave,
  onReload,
}: {
  p: P;
  onSave: (id: string, patch: Patch) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [notes, setNotes] = useState(p.notes);
  const [email, setEmail] = useState(p.email);
  const [contact, setContact] = useState(p.contactName);
  const makeOg = useOgMaker();
  const hasVideo = !!p.videoUrl;
  const text = p.link ? (hasVideo ? videoMessage(p, p.link) : shareText(p, p.link)) : "";
  const emailText = p.link && hasVideo ? videoMessage(p, p.link, true) : text;
  const emailSubject = hasVideo
    ? `A quick video about ${p.name} on Google`
    : `How ${p.name} shows up on Google`;
  const watched = watchLabel(p.videoFirstPlayedAt, p.videoMaxPercent);
  // Sharing a report moves a new prospect to "sent" and sets a follow-up in 3
  // days. It also makes the link-preview picture if there is none yet.
  const shared = async () => {
    if (!p.ogImage)
      void makeOg(
        p,
        p.videoUrl && p.videoKind ? { kind: p.videoKind, url: p.videoUrl } : null,
      ).then((ok) => (ok ? onReload() : undefined));
    if (p.stage === "new") await onSave(p.id, { stage: "sent", followUpOn: today(3) });
  };
  const phone = p.phone.replace(/[^\d+]/g, "");
  const noWhatsApp = p.phoneType === "landline" || p.phoneType === "none";
  return (
    <li className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 rounded-lg px-2 py-1 text-sm font-bold ${scoreClass(p.score)}`}>
          {p.score ?? "-"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{p.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {p.town}
            {p.opens > 0 ? ` - opened ${p.opens} time${p.opens === 1 ? "" : "s"}` : ""}
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
          onChange={(e) =>
            void onSave(p.id, { stage: e.target.value as (typeof STAGE_IDS)[number] })
          }
          className="shrink-0 rounded-lg border border-input bg-background px-2 py-1 text-xs"
        >
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {p.link && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <a
            href={p.link}
            target="_blank"
            rel="noopener"
            className="rounded-lg border border-border px-2.5 py-1.5 inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open
          </a>
          <a
            href={`${p.link}?print=1`}
            target="_blank"
            rel="noopener"
            title="Opens the report ready to save as a PDF"
            className="rounded-lg border border-border px-2.5 py-1.5 inline-flex items-center gap-1"
          >
            <FileDown className="w-3.5 h-3.5" /> PDF
          </a>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              toast.success("Message and link copied");
              await shared();
            }}
            className="rounded-lg border border-border px-2.5 py-1.5 inline-flex items-center gap-1"
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
          {noWhatsApp ? (
            <span
              title={p.phoneType === "none" ? "No phone number" : "This looks like a landline"}
              className="rounded-lg border border-border px-2.5 py-1.5 inline-flex items-center gap-1 opacity-40 cursor-not-allowed"
              aria-disabled="true"
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </span>
          ) : (
            <a
              href={`https://wa.me/${phone.startsWith("+") ? phone.slice(1) : ""}?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noopener"
              onClick={() => void shared()}
              title={
                p.phoneType === "mobile" ? "Mobile number: very likely on WhatsApp" : undefined
              }
              className={`rounded-lg border px-2.5 py-1.5 inline-flex items-center gap-1 ${
                p.phoneType === "mobile" ? "border-emerald-600 text-emerald-700" : "border-border"
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          )}
          <a
            title={p.email ? `Email ${p.email}` : "No email yet. Add one in Details."}
            href={`mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailText)}`}
            onClick={() => void shared()}
            className="rounded-lg border border-border px-2.5 py-1.5 inline-flex items-center gap-1"
          >
            <Mail className="w-3.5 h-3.5" /> Email
          </a>
          <a
            href={`sms:${phone}?&body=${encodeURIComponent(text)}`}
            onClick={() => void shared()}
            className="rounded-lg border border-border px-2.5 py-1.5 inline-flex items-center gap-1"
          >
            <Smartphone className="w-3.5 h-3.5" /> Text
          </a>
          <button
            type="button"
            onClick={() => setVideoOpen((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 inline-flex items-center gap-1 ${
              hasVideo ? "border-emerald-600 text-emerald-700" : "border-border"
            }`}
          >
            <Video className="w-3.5 h-3.5" /> {hasVideo ? "Video added" : "Add video"}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto px-2 py-1.5 inline-flex items-center gap-1 text-muted-foreground"
          >
            Details{" "}
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
      {videoOpen && p.link && <VideoPanel p={p} makeOg={makeOg} onReload={onReload} />}
      {open && (
        <div className="grid sm:grid-cols-2 gap-2 pt-1">
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Contact name"
            className={field}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={field}
          />
          <label className="text-xs space-y-1 sm:col-span-2">
            <span className="font-semibold">Follow up on</span>
            <input
              type="date"
              value={p.followUpOn ?? ""}
              onChange={(e) => void onSave(p.id, { followUpOn: e.target.value || null })}
              className={field}
            />
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Notes"
            className={`${field} sm:col-span-2`}
          />
          <button
            type="button"
            onClick={() =>
              void onSave(p.id, { notes, email, contactName: contact }).then(() =>
                toast.success("Saved"),
              )
            }
            className="rounded-lg bg-primary text-primary-foreground font-semibold px-3 py-2 text-sm sm:col-span-2"
          >
            Save details
          </button>
          {p.phone && (
            <p className="text-xs text-muted-foreground sm:col-span-2">Phone: {p.phone}</p>
          )}
        </div>
      )}
    </li>
  );
}

// Add, replace or remove the personal video shown at the top of the report.
function VideoPanel({
  p,
  makeOg,
  onReload,
}: {
  p: P;
  makeOg: ReturnType<typeof useOgMaker>;
  onReload: () => Promise<void>;
}) {
  const save = useServerFn(saveProspectVideo);
  const remove = useServerFn(removeProspectVideo);
  const start = useServerFn(startProspectUpload);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pct, setPct] = useState<number | null>(null);

  async function finish(video: { kind: string; url: string }, file?: File) {
    setBusy("Making the link preview picture");
    const ok = await makeOg(p, video, file);
    if (!ok) toast.message("Video saved. The preview picture will be made when you share.");
    else toast.success("Video saved. It now shows at the top of the report.");
    setBusy(null);
    setLink("");
    await onReload();
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
              const r = await remove({ data: { id: p.id } }).catch(() => null);
              setBusy(null);
              if (!r?.ok) {
                toast.error(r?.error ?? "Could not remove the video.");
                return;
              }
              toast.success("Video removed");
              await onReload();
            }}
            className="ml-auto rounded-lg border border-border px-2 py-1 text-xs inline-flex items-center gap-1 disabled:opacity-50"
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
          className={field}
        />
        <button
          type="button"
          disabled={busy !== null || !link.trim()}
          onClick={() => void saveLink()}
          className="rounded-lg bg-primary text-primary-foreground px-3 font-semibold disabled:opacity-50"
        >
          {p.videoUrl ? "Replace" : "Save"}
        </button>
      </div>
      <label
        className={`rounded-lg border border-dashed border-border px-3 py-2 flex items-center gap-2 cursor-pointer ${
          busy ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <Upload className="w-4 h-4" />
        <span>Or upload a video file (mp4, mov or webm, up to 200 MB)</span>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </label>
      {busy && (
        <div className="space-y-1">
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
