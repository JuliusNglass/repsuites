// Lead generator (Accelur8 team): find a business or a niche in a town, build
// a free Google visibility report, share it, and track follow-ups.
// No em dashes in this copy (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileDown,
  Loader2,
  Mail,
  MessageCircle,
  Search,
  Smartphone,
  Star,
} from "lucide-react";
import { Logo } from "../components/site/Logo";
import {
  buildProspectReport,
  addProspectPhrase,
  listProspects,
  searchProspects,
  updateProspect,
} from "../lib/prospects.functions";

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

  // "Build all": up to 10 businesses without a report yet, one after another.
  async function buildAll() {
    const todo = (hits ?? []).filter((h) => !h.saved).slice(0, 10);
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
  const [building, setBuilding] = useState<string | null>(null);
  const [stage, setStage] = useState<string>("all");

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
                const r = await search({ data: { q } });
                setSearching(false);
                if (r.ok) setHits(r.hits);
                else toast.error(r.error);
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
            {(hits ?? []).filter((h) => !h.saved).length > 1 && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 flex flex-wrap items-center gap-3">
                <p className="text-sm flex-1 min-w-0">
                  {batch
                    ? `Building ${batch.done + 1 > batch.total ? batch.total : batch.done + 1} of ${batch.total}. Keep this page open.`
                    : `Build reports for all ${Math.min(10, (hits ?? []).filter((h) => !h.saved).length)} new businesses here in one go (about ${Math.min(10, (hits ?? []).filter((h) => !h.saved).length) * 10}p).`}
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
              {(hits ?? []).map((h) => (
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
                <ProspectRow key={p.id} p={p} onSave={save} />
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

function ProspectRow({ p, onSave }: { p: P; onSave: (id: string, patch: Patch) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(p.notes);
  const [email, setEmail] = useState(p.email);
  const [contact, setContact] = useState(p.contactName);
  const text = p.link ? shareText(p, p.link) : "";
  // Sharing a report moves a new prospect to "sent" and sets a follow-up in 3 days.
  const shared = async () => {
    if (p.stage === "new") await onSave(p.id, { stage: "sent", followUpOn: today(3) });
  };
  const phone = p.phone.replace(/[^\d+]/g, "");
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
          {p.topFix && <p className="text-xs mt-0.5 truncate">{p.topFix}</p>}
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
          <a
            href={`https://wa.me/${phone.startsWith("+") ? phone.slice(1) : ""}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener"
            onClick={() => void shared()}
            className="rounded-lg border border-border px-2.5 py-1.5 inline-flex items-center gap-1"
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
          <a
            href={`mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(`How ${p.name} shows up on Google`)}&body=${encodeURIComponent(text)}`}
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
            onClick={() => setOpen((v) => !v)}
            className="ml-auto px-2 py-1.5 inline-flex items-center gap-1 text-muted-foreground"
          >
            Details{" "}
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
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
