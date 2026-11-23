// Fit call sheet (Accelur8 team): script, live break-even maths, save to GHL, invoice links.
// No em dashes in this copy (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { loadCallContact, saveCall, createLaunchInvoice } from "../lib/call-sheet.functions";
import {
  breakEvenContracts,
  FIELDS,
  OBJECTIONS,
  OUTCOMES,
  perDay,
  YEAR_ONE_COST,
  yearlyProfit,
} from "../lib/call-sheet";

export const Route = createFileRoute("/call")({
  head: () => ({ meta: [{ title: "Fit call" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ c: typeof s["c"] === "string" ? s["c"] : "" }),
  component: CallSheet,
});

const STEPS: { t: string; say: string }[] = [
  {
    t: "1. Open (1 min)",
    say: "Thanks for booking, {name}. In 10 minutes we'll see if commercial contracts make sense for you. If it's a fit I'll show you how to start. If not, I'll tell you. Fair?",
  },
  {
    t: "2. Who decides",
    say: "Is anyone else involved in a decision like this, a partner or co-owner? Would they want to be on this call? (Handle partner now, not at the end.)",
  },
  {
    t: "3. Where you are now",
    say: "How much commercial work do you have now, roughly per week? How do you win it today? What has stopped you getting more?",
  },
  {
    t: "4. The numbers",
    say: "What does a typical small office clean pay you per week? And after wages and products, roughly what percent do you keep? (Fill in the boxes, then read the maths out.)",
  },
  {
    t: "5. Lead question",
    say: "If they ask how many leads you guarantee: We never guarantee leads, nobody honest can. We guarantee the work: the ads, the page, the follow-ups, the quoting system. You only need about {be} contracts to cover the year. How many do you think you could win if we put you in front of the right offices?",
  },
  {
    t: "6. Tie-down",
    say: "So if we got you just {be} contracts, the whole year pays for itself and everything after is profit. Does that make sense?",
  },
  {
    t: "7. Think about it",
    say: "Totally fair. What exactly do you want to think over: the money, the timing, or whether it'll work? (Answer that one thing.)",
  },
  {
    t: "8. Close",
    say: "It's £2,000, or 3 payments of £700. Which suits you better? I'll text you the secure link now.",
  },
];

function CallSheet() {
  const { c } = Route.useSearch();
  const load = useServerFn(loadCallContact);
  const save = useServerFn(saveCall);
  const invoice = useServerFn(createLaunchInvoice);
  const [id, setId] = useState(c);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadCallContact>> | null>(null);
  const [busy, setBusy] = useState("");
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
  const name = data?.ok ? data.contact.firstName || "there" : "there";
  const steps = useMemo(
    () =>
      STEPS.map((s) => ({
        ...s,
        say: s.say.replace("{name}", name).replaceAll("{be}", be ? String(be) : "2 or 3"),
      })),
    [name, be],
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

  const input = "mt-1 w-full rounded-lg border border-slate-300 p-3 text-base";
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 text-base leading-relaxed text-slate-900">
      {busy === "load" && <Loader2 className="animate-spin" />}
      {data && !data.ok && <p className="text-red-700">{data.error}</p>}
      {data?.ok && (
        <section className="rounded-xl bg-slate-900 p-4 text-white">
          <h1 className="text-2xl font-bold">{data.contact.name}</h1>
          <p>
            {data.contact.company} · {data.contact.phone} · {data.contact.email}
          </p>
          {data.notes.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold">
                Prep notes ({data.notes.length})
              </summary>
              {data.notes.map((n, i) => (
                <p key={i} className="mt-2 whitespace-pre-wrap rounded bg-white/10 p-2 text-sm">
                  {n.body}
                </p>
              ))}
            </details>
          )}
        </section>
      )}

      <section className="rounded-xl border p-4">
        <h2 className="mb-2 text-xl font-bold">The maths</h2>
        <div className="grid grid-cols-2 gap-3">
          <label>
            Typical clean, £ per week
            <input
              type="number"
              inputMode="decimal"
              className={input}
              value={f.weekly}
              onChange={set("weekly")}
            />
          </label>
          <label>
            Margin kept, %
            <input
              type="number"
              inputMode="decimal"
              className={input}
              value={f.margin}
              onChange={set("margin")}
            />
          </label>
        </div>
        <p className="mt-3">
          One contract keeps you £{f.weekly} × {f.margin}% × 52 weeks ={" "}
          <b>£{profit.toLocaleString()} a year</b>.
        </p>
        <p>
          Year one costs £{YEAR_ONE_COST.toLocaleString()} (£2,000 launch + 9 months of SparkOps at
          £97). That's about £{perDay(YEAR_ONE_COST)} a day.
        </p>
        <p className="mt-2 text-2xl font-bold text-emerald-700">
          Break-even: {be ?? "-"} contracts
        </p>
      </section>

      <section className="space-y-3">
        {steps.map((s) => (
          <details key={s.t} className="rounded-xl border p-4" open>
            <summary className="cursor-pointer font-semibold">{s.t}</summary>
            <p className="mt-2">{s.say}</p>
          </details>
        ))}
      </section>

      <section className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
        <label>
          Commercial income now, £/week
          <input
            type="number"
            className={input}
            value={f.commercialNow}
            onChange={set("commercialNow")}
          />
        </label>
        <label>
          Decision maker
          <input className={input} value={f.decisionMaker} onChange={set("decisionMaker")} />
        </label>
        <label className="sm:col-span-2">
          How they win commercial work
          <input className={input} value={f.howWin} onChange={set("howWin")} />
        </label>
        <label className="sm:col-span-2">
          Main blocker
          <input className={input} value={f.blocker} onChange={set("blocker")} />
        </label>
        <label>
          Objection
          <select className={input} value={f.objection} onChange={set("objection")}>
            <option value="">-</option>
            {OBJECTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label>
          Outcome
          <select className={input} value={f.outcome} onChange={set("outcome")}>
            <option value="">-</option>
            {OUTCOMES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          Recording link (Google Meet)
          <input
            className={input}
            placeholder="https://"
            value={f.recording}
            onChange={set("recording")}
          />
        </label>
        <label className="sm:col-span-2">
          Notes
          <textarea rows={4} className={input} value={f.notes} onChange={set("notes")} />
        </label>
        <button
          disabled={!!busy}
          onClick={onSave}
          className="rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white sm:col-span-2"
        >
          {busy === "save" ? "Saving..." : "Save to GHL"}
        </button>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="mb-2 text-xl font-bold">Payment link</h2>
        <div className="flex flex-wrap gap-3">
          <button
            disabled={!!busy}
            onClick={() => onInvoice("full")}
            className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white"
          >
            {busy === "full" ? "Creating..." : "Pay in full £2,000"}
          </button>
          <button
            disabled={!!busy}
            onClick={() => onInvoice("monthly")}
            className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white"
          >
            {busy === "monthly" ? "Creating..." : "3 x £700"}
          </button>
        </div>
        {links.map((l) => (
          <p key={l.url} className="mt-3 flex items-center gap-2 break-all">
            <b>{l.plan === "full" ? "£2,000" : "3 x £700"}:</b>{" "}
            <a className="underline" href={l.url} target="_blank" rel="noreferrer">
              {l.url}
            </a>
            <button aria-label="Copy link" onClick={() => navigator.clipboard?.writeText(l.url)}>
              <Copy size={18} />
            </button>
          </p>
        ))}
        <p className="mt-2 text-sm text-slate-600">
          The link is copied for you. Text it from GHL or your phone.
        </p>
      </section>
    </main>
  );
}
