// Fit call sheet (Accelur8 team): script, live break-even maths, save to GHL, invoice links.
// No em dashes in this copy (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Copy, Loader2, Video } from "lucide-react";
import { SignInCard } from "../components/SignInCard";
import {
  loadCallContact,
  saveCall,
  createLaunchInvoice,
  loadTodayCalls,
} from "../lib/call-sheet.functions";
import {
  breakEvenContracts,
  contractsToCover,
  STARTER_OFFICE_HOURS,
  FIELDS,
  OBJECTION_SCRIPTS,
  OBJECTIONS,
  OUTCOMES,
  perDay,
  YEAR_ONE_COST,
  yearlyProfit,
} from "../lib/call-sheet";

export const Route = createFileRoute("/call")({
  head: () => ({
    meta: [{ title: "Fit call · SparkOps" }, { name: "robots", content: "noindex" }],
    // Team tool: show the SparkOps icon in the tab, not the RepSuites one.
    links: [{ rel: "icon", href: "https://ops.accelur8clientwork.com/favicon.ico" }],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ c: typeof s["c"] === "string" ? s["c"] : "" }),
  component: CallSheet,
});

// say = the words to read out. cue = a note for you only (shown differently).
// fields = the answer boxes for that step.
type FieldKey =
  | "decisionMaker"
  | "commercialNow"
  | "howWin"
  | "blocker"
  | "quality"
  | "stayMonths"
  | "weekly"
  | "margin"
  | "cleanerHourly";
const FIELD_LABELS: Record<FieldKey, { label: string; num?: boolean }> = {
  decisionMaker: { label: "Who decides" },
  commercialNow: { label: "Commercial work now (£ per week)", num: true },
  howWin: { label: "How they win work today" },
  blocker: { label: "What has stopped them getting more" },
  quality: { label: "How their clients describe their work" },
  stayMonths: { label: "How long a new client would stay (months)", num: true },
  weekly: { label: "£ per week for one small office", num: true },
  margin: { label: "% they keep after wages and products", num: true },
  cleanerHourly: { label: "What they pay a cleaner per hour (£)", num: true },
};
const STEPS: { t: string; say: string; cue?: string; domestic?: string; fields?: FieldKey[] }[] = [
  {
    t: "1. Open (1 min)",
    say: "Thanks for booking, {name}. In 10 minutes we'll see if commercial contracts make sense for you. If it's a fit I'll show you how to start. If not, I'll tell you. Fair?",
  },
  {
    t: "2. Who decides",
    say: "Is anyone else involved in a decision like this, a partner or co-owner? Would they want to be on this call?",
    cue: "If there is a partner, handle it now, not at the end.",
    fields: ["decisionMaker"],
  },
  {
    t: "3. Where you are now",
    say: "How much commercial work do you have now, roughly per week? How do you win it today? What has stopped you getting more?",
    domestic:
      "So you mostly do homes right now. How do you win new clients today? What has stopped you going after offices and other commercial work so far?",
    fields: ["commercialNow", "howWin", "blocker"],
  },
  {
    t: "4. Your quality",
    say: "How would your clients describe your work? ... If you won a new office contract, how long do you think they would stay with you?",
    cue: "Let them sell themselves. You want them to say: at least 3 to 6 months. Repeat it back to them.",
    fields: ["quality", "stayMonths"],
  },
  {
    t: "5. The numbers",
    say: "What would a typical small office clean pay you per week? ... For a guide, a barber shop is often about £40 to £75 a week, a small office £100 to £180, a community hall £60 to £120. Does that sound about right where you are? And after wages and products, roughly what percent do you keep?",
    domestic:
      "What do you charge per hour for a clean? ... A small office usually needs about 2 hours, 3 times a week. That's 6 hours, so at your rate that's about £{week} a week from one office. After wages and products, roughly what percent do you keep?",
    cue: "The guide prices are rough UK figures, not researched for their town. Check them against what they say. Domestic only: tick Mostly domestic and type their hourly rate.",
    fields: ["weekly", "margin"],
  },
  {
    t: "6. Tie-down",
    say: "You said a new client would stay about {stay} months. So if we got you just {be} contracts in the next 3 months, and each one stayed about {stay} months, the whole programme pays for itself. Everything after that is pure profit. Does that make sense?",
  },
  {
    t: "7. Close",
    say: "What do you pay a cleaner for an hour? ... The 3 months is £2,000, about £22 a day. That's about what you pay a cleaner for one hour. You can pay it in full, or in 3 payments of £700. Which suits you better? I'll text you the secure link now.",
    fields: ["cleanerHourly"],
  },
];

function CallSheet() {
  const { c } = Route.useSearch();
  const load = useServerFn(loadCallContact);
  const save = useServerFn(saveCall);
  const invoice = useServerFn(createLaunchInvoice);
  const loadToday = useServerFn(loadTodayCalls);
  const [today, setToday] = useState<
    { contactId: string; title: string; time: string; at: number }[]
  >([]);
  useEffect(() => {
    loadToday()
      .then((r) => r.ok && setToday(r.calls))
      .catch(() => undefined);
  }, [loadToday]);
  const [id, setId] = useState(c);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadCallContact>> | null>(null);
  const [busy, setBusy] = useState("");
  const [step, setStep] = useState(0);
  const [links, setLinks] = useState<{ plan: string; url: string }[]>([]);
  const [f, setF] = useState({
    weekly: 100,
    margin: 25,
    commercialNow: 0,
    blocker: "",
    decisionMaker: "",
    outcome: "",
    objection: "",
    recording: "",
    howWin: "",
    notes: "",
    quality: "",
    stayMonths: 6,
    cleanerHourly: 0,
    transcript: "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({
      ...p,
      [k]: typeof p[k] === "number" ? Number(e.target.value) || 0 : e.target.value,
    }));

  useEffect(() => {
    if (!c) return undefined;
    setBusy("load");
    load({ data: { id: c } }).then((r) => {
      setBusy("");
      setData(r);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const v = r.custom;
      setF((p) => ({
        ...p,
        weekly: Number(v[FIELDS.weekly]) || p.weekly,
        margin: Number(v[FIELDS.margin]) || p.margin,
        commercialNow: Number(v[FIELDS.commercialNow]) || 0,
        blocker: v[FIELDS.blocker] ?? "",
        decisionMaker: v[FIELDS.decisionMaker] ?? "",
        outcome: v[FIELDS.outcome] ?? "",
        objection: v[FIELDS.objection] ?? "",
        recording: v[FIELDS.recording] ?? "",
        howWin: v[FIELDS.howWin] ?? "",
      }));
    });
    return undefined;
  }, [c, load]);

  const profit = yearlyProfit(f.weekly, f.margin);
  const be = breakEvenContracts(f.weekly, f.margin);
  const be6 = contractsToCover(f.weekly, f.margin, Math.round((f.stayMonths || 6) * 4.33));
  const be3 = contractsToCover(f.weekly, f.margin, 13);
  const [domestic, setDomestic] = useState(false);
  const [hourly, setHourly] = useState(0);
  const name = data?.ok ? data.contact.firstName || "there" : "there";
  const steps = useMemo(
    () =>
      STEPS.map((s) => {
        const fill = (x: string) =>
          x
            .replace("{name}", name)
            .replaceAll("{be}", be6 ? String(Math.ceil(be6)) : "2 or 3")
            .replaceAll("{stay}", String(f.stayMonths || 6))
            .replaceAll("{week}", String(Math.round(f.weekly)));
        return {
          ...s,
          say: fill(domestic && s.domestic ? s.domestic : s.say),
          cue: s.cue ? fill(s.cue) : undefined,
        };
      }),
    [name, be6, domestic, f.weekly, f.stayMonths],
  );

  async function onSave() {
    if (!c) return;
    setBusy("save");
    const r = await save({ data: { id: c, ...f } });
    setBusy("");
    if (r.ok) toast.success("Saved to GHL");
    else toast.error(r.error);
  }
  async function onInvoice(plan: "full" | "monthly") {
    if (!c) return;
    setBusy(plan);
    const r = await invoice({ data: { id: c, plan } });
    setBusy("");
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setLinks((l) => [...l, { plan, url: r.url }]);
    navigator.clipboard?.writeText(r.url).catch(() => {});
    toast.success("Invoice link copied");
  }

  if (!c)
    return (
      <main className="mx-auto max-w-xl p-4 text-base leading-relaxed">
        <h1 className="mb-3 text-2xl font-bold">Fit call</h1>
        <label className="block">
          GHL contact id
          <input
            className="mt-1 w-full rounded border p-3"
            value={id}
            onChange={(e) => setId(e.target.value.trim())}
          />
        </label>
        <a
          className="mt-3 inline-block rounded bg-slate-900 px-4 py-3 text-white"
          href={`/call?c=${encodeURIComponent(id)}`}
        >
          Open
        </a>
      </main>
    );

  const input = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-base";
  const card = "rounded-xl border border-slate-200 bg-white p-3";
  const fill = (t: string) =>
    t.replaceAll("{be}", be6 ? String(Math.ceil(be6)) : "2 or 3").replace("{month}", nextMonth());
  const obj = OBJECTION_SCRIPTS[f.objection];
  const call = data?.ok ? data.call : null;
  const callTime = call
    ? new Date(call.start).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      })
    : "";
  const revealHref = `/reveal?w=${f.weekly}&m=${f.margin}&n=${encodeURIComponent(data?.ok ? data.contact.firstName : "")}`;

  return (
    <main className="grid min-h-screen gap-3 bg-slate-100 p-3 text-base leading-relaxed text-slate-900 lg:h-screen lg:grid-cols-3 lg:overflow-hidden">
      {data && !data.ok && /sign in/i.test(data.error) && (
        <section className="lg:col-span-3">
          <p className="mb-3">Sign in with your Accelur8 account to open this call.</p>
          <SignInCard isConfigured onSignedIn={() => window.location.reload()} />
        </section>
      )}
      {data && !data.ok && !/sign in/i.test(data.error) && (
        <p className="text-red-700 lg:col-span-3">{data.error}</p>
      )}
      {busy === "load" && <Loader2 className="animate-spin" />}
      {today.length > 0 && (
        <nav aria-label="Today's calls" className="flex flex-wrap items-center gap-2 lg:col-span-3">
          <span className="text-sm font-bold">Today ({today.length}):</span>
          {today.map((t) => (
            <a
              key={`${t.contactId}-${t.time}`}
              href={`/call?c=${encodeURIComponent(t.contactId)}`}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${t.contactId === c ? "bg-slate-900 text-white" : t.at < Date.now() ? "bg-slate-200 text-slate-500" : "bg-white text-slate-900 shadow-sm"}`}
            >
              {t.time} {t.title.replace(/ - SparkOps fit call$/i, "")}
            </a>
          ))}
        </nav>
      )}

      {/* Column 1: who, join, maths, money */}
      <div className="flex flex-col gap-3 lg:overflow-y-auto">
        {data?.ok && (
          <section className="rounded-xl bg-slate-900 p-3 text-white">
            <h1 className="text-xl font-bold">{data.contact.name}</h1>
            <p className="text-sm">
              {data.contact.company} · {data.contact.phone}
            </p>
            <p className="text-sm">{data.contact.email}</p>
            {call?.meet ? (
              <a
                href={call.meet}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 font-semibold text-slate-900"
              >
                <Video size={18} /> Join Google Meet · {callTime}
              </a>
            ) : (
              <p className="mt-2 text-sm text-amber-300">
                {call
                  ? `Call ${callTime}, no Meet link on the booking`
                  : "No upcoming Fit Call found"}
              </p>
            )}
            {data.notes.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-semibold">Prep notes</summary>
                <div className="mt-1 max-h-48 overflow-y-auto">
                  {data.notes.map((n, i) => (
                    <p key={i} className="mt-1 whitespace-pre-wrap rounded bg-white/10 p-2 text-sm">
                      {n.body}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

        <section className={card}>
          <h2 className="font-bold">The maths</h2>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={domestic}
              onChange={(e) => setDomestic(e.target.checked)}
            />
            Mostly domestic (no office work yet)
          </label>
          {domestic && (
            <label className="mt-1 block text-sm">
              Their hourly rate (£), we'll work out one small office: 2 hours, 3 times a week
              <input
                type="number"
                inputMode="decimal"
                className={input}
                value={hourly || ""}
                onChange={(e) => {
                  const h = Number(e.target.value) || 0;
                  setHourly(h);
                  if (h > 0) setF((p) => ({ ...p, weekly: h * STARTER_OFFICE_HOURS }));
                }}
              />
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              £ per week, typical clean
              <input
                type="number"
                inputMode="decimal"
                className={input}
                value={f.weekly}
                onChange={set("weekly")}
              />
            </label>
            <label className="text-sm">
              % kept
              <input
                type="number"
                inputMode="decimal"
                className={input}
                value={f.margin}
                onChange={set("margin")}
              />
            </label>
          </div>

          <p className="text-xl font-bold text-emerald-700">
            Covers the £2,000: {be6 ? Math.ceil(be6) : "-"} contracts lasting {f.stayMonths || 6}{" "}
            months
          </p>
          <p className="text-sm text-slate-600">
            Or {be3 ? Math.ceil(be3) : "-"} contracts lasting 3 months. Worked out: £{f.weekly} a
            week × {f.margin}% kept × {Math.round((f.stayMonths || 6) * 4.33)} weeks = £
            {Math.round(
              f.weekly * (f.margin / 100) * Math.round((f.stayMonths || 6) * 4.33),
            ).toLocaleString()}{" "}
            per contract, and £2,000 ÷ that = {be6 ?? "-"}.
          </p>
          <a
            className="mt-2 block rounded-lg bg-emerald-700 px-3 py-2 text-center font-semibold text-white"
            target="_blank"
            rel="noreferrer"
            href={revealHref}
          >
            Open the reveal to share on screen
          </a>
        </section>

        <section className={card}>
          <h2 className="font-bold">Payment link</h2>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              disabled={!!busy}
              onClick={() => onInvoice("full")}
              className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white"
            >
              {busy === "full" ? "Creating..." : "£2,000 in full"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => onInvoice("monthly")}
              className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white"
            >
              {busy === "monthly" ? "Creating..." : "3 x £700"}
            </button>
          </div>
          {links.map((l) => (
            <p key={l.url} className="mt-2 flex items-center gap-2 break-all text-sm">
              <b>{l.plan === "full" ? "£2,000" : "3 x £700"}:</b>
              <a className="underline" href={l.url} target="_blank" rel="noreferrer">
                {l.url}
              </a>
              <button aria-label="Copy link" onClick={() => navigator.clipboard?.writeText(l.url)}>
                <Copy size={16} />
              </button>
            </p>
          ))}
          <p className="mt-1 text-sm text-slate-600">The link is copied for you to text.</p>
        </section>
      </div>

      {/* Column 2: the script, one step at a time */}
      <div className="flex flex-col gap-3 lg:overflow-y-auto">
        <section className={card}>
          <h2 className="font-bold">Script</h2>
          <div className="mt-2 flex flex-wrap gap-1" role="tablist">
            {steps.map((s, i) => (
              <button
                key={s.t}
                role="tab"
                aria-selected={i === step}
                onClick={() => setStep(i)}
                className={`h-10 w-10 rounded-full font-semibold ${i === step ? "bg-slate-900 text-white" : "bg-slate-100"}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <h3 className="mt-3 text-lg font-bold">{steps[step]!.t}</h3>
          {steps[step]!.cue && (
            <p className="mt-2 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-base italic text-amber-900">
              For you: {steps[step]!.cue}
            </p>
          )}
          <p className="mt-2 text-lg font-medium">
            <span className="mr-1 text-sm font-bold uppercase tracking-wide text-slate-500">
              Say:
            </span>
            {steps[step]!.say}
          </p>
          {(STEPS[step]!.fields ?? []).length > 0 && (
            <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3">
              {(STEPS[step]!.fields ?? []).map((k) => (
                <label key={k} className="text-sm font-semibold">
                  {FIELD_LABELS[k].label}
                  <input
                    type={FIELD_LABELS[k].num ? "number" : "text"}
                    inputMode={FIELD_LABELS[k].num ? "decimal" : undefined}
                    className={input}
                    value={String(f[k] ?? "")}
                    onChange={set(k)}
                  />
                </label>
              ))}
            </div>
          )}
          <div className="mt-3 flex justify-between">
            <button
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 disabled:opacity-40"
            >
              <ChevronLeft size={18} /> Back
            </button>
            <button
              disabled={step === steps.length - 1}
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-40"
            >
              Next <ChevronRight size={18} />
            </button>
          </div>
        </section>
        <section className={card}>
          <h2 className="font-bold">Objection? Tap it</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.keys(OBJECTION_SCRIPTS).map((o) => (
              <button
                key={o}
                aria-pressed={f.objection === o}
                onClick={() => setF((p) => ({ ...p, objection: p.objection === o ? "" : o }))}
                className={`rounded-full px-3 py-1.5 font-semibold ${f.objection === o ? "bg-amber-400" : "bg-slate-100"}`}
              >
                {o}
              </button>
            ))}
          </div>
          {obj && (
            <div className="mt-3 space-y-2">
              <p>
                <b>Say:</b> {fill(obj.handle)}
              </p>
              <p className="rounded-lg bg-emerald-50 p-2">
                <b>Pivot to close:</b> {fill(obj.pivot)}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Column 3: capture and save */}
      <div className="flex flex-col gap-3 lg:overflow-y-auto">
        <section className={`${card} grid grid-cols-2 gap-2`}>
          <h2 className="col-span-2 font-bold">Their answers</h2>
          <label className="text-sm">
            Commercial now £/wk
            <input
              type="number"
              className={input}
              value={f.commercialNow}
              onChange={set("commercialNow")}
            />
          </label>
          <label className="text-sm">
            Decision maker
            <input className={input} value={f.decisionMaker} onChange={set("decisionMaker")} />
          </label>
          <label className="col-span-2 text-sm">
            How they win commercial work
            <input className={input} value={f.howWin} onChange={set("howWin")} />
          </label>
          <label className="col-span-2 text-sm">
            Main blocker
            <input className={input} value={f.blocker} onChange={set("blocker")} />
          </label>
          <label className="text-sm">
            Objection
            <select className={input} value={f.objection} onChange={set("objection")}>
              <option value="">-</option>
              {OBJECTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Outcome
            <select className={input} value={f.outcome} onChange={set("outcome")}>
              <option value="">-</option>
              {OUTCOMES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 text-sm">
            Recording link
            <input
              className={input}
              placeholder="https://"
              value={f.recording}
              onChange={set("recording")}
            />
          </label>
          <label className="col-span-2 text-sm">
            Call transcript (paste it here, or paste it in the chat and Claude fills the boxes)
            <textarea
              rows={4}
              className={input}
              value={f.transcript}
              onChange={set("transcript")}
            />
          </label>
          <label className="col-span-2 text-sm">
            Notes
            <textarea rows={5} className={input} value={f.notes} onChange={set("notes")} />
          </label>
          <button
            disabled={!!busy}
            onClick={onSave}
            className="col-span-2 rounded-lg bg-slate-900 px-3 py-3 font-semibold text-white"
          >
            {busy === "save" ? "Saving..." : "Save to GHL"}
          </button>
        </section>
      </div>
    </main>
  );
}

function nextMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 2, 1);
  return d.toLocaleString("en-GB", { month: "long" });
}
