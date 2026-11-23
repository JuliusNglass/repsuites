// Client-facing investment vs return reveal, shared on screen during a fit call.
// Numbers come from the URL (?w=weekly&m=margin&n=name). No personal data stored.
// No em dashes in this copy (AGENTS.md). Branded Accelur8.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { breakEvenContracts, perDay, YEAR_ONE_COST, yearlyProfit } from "../lib/call-sheet";

export const Route = createFileRoute("/reveal")({
  head: () => ({
    meta: [{ title: "Your contract plan | Accelur8" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    w: Number(s["w"]) > 0 ? Number(s["w"]) : 100,
    m: Number(s["m"]) > 0 ? Number(s["m"]) : 25,
    n: typeof s["n"] === "string" ? s["n"].slice(0, 40) : "",
  }),
  component: Reveal,
});

const gbp = (v: number) => `£${Math.round(v).toLocaleString("en-GB")}`;

function Reveal() {
  const s = Route.useSearch();
  const [w, setW] = useState(s.w);
  const [m, setM] = useState(s.m);
  const [pick, setPick] = useState(3);
  const per = yearlyProfit(w, m);
  const be = breakEvenContracts(w, m);
  const bars = useMemo(() => [1, 2, 3, 4, 5, 6].map((n) => ({ n, value: per * n })), [per]);
  const max = Math.max(YEAR_ONE_COST, ...bars.map((b) => b.value)) * 1.1;
  const sel = bars.find((b) => b.n === pick) ?? bars[2]!;
  const left = sel.value - YEAR_ONE_COST;
  const H = 260;
  const costY = H - (YEAR_ONE_COST / max) * H;

  return (
    <main className="min-h-screen bg-[#071426] px-4 py-8 text-base leading-relaxed text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-300">Accelur8</p>
          <h1 className="mt-1 text-3xl font-bold">
            {s.n ? `${s.n}, here's your contract plan` : "Your contract plan"}
          </h1>
          <p className="mt-2 text-slate-300">
            What small office contracts could add to your year, against what it costs to get
            started.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 rounded-2xl bg-white/5 p-4">
          <label className="text-sm text-slate-300">
            A typical small office pays you, per week
            <input
              type="number"
              inputMode="decimal"
              value={w}
              onChange={(e) => setW(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg bg-white/10 p-3 text-lg font-semibold text-white"
            />
          </label>
          <label className="text-sm text-slate-300">
            You keep, after wages and products (%)
            <input
              type="number"
              inputMode="decimal"
              value={m}
              onChange={(e) => setM(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg bg-white/10 p-3 text-lg font-semibold text-white"
            />
          </label>
        </section>

        <section className="rounded-2xl bg-white/5 p-4">
          <h2 className="text-xl font-bold">Money kept in a year, by number of contracts</h2>
          <p className="text-sm text-slate-300">
            Tap a bar to see the detail. The dashed line is your year one cost.
          </p>
          <div
            className="relative mt-4"
            style={{ height: H + 28 }}
            role="group"
            aria-label="Contracts chart"
          >
            <div
              className="absolute inset-x-0 border-t-2 border-dashed border-amber-300"
              style={{ top: costY }}
            >
              <span className="absolute -top-6 right-0 rounded bg-amber-300 px-2 text-sm font-semibold text-[#071426]">
                Year one cost {gbp(YEAR_ONE_COST)}
              </span>
            </div>
            <div className="flex h-full items-end gap-2 sm:gap-4">
              {bars.map((b) => {
                const h = Math.max(4, (b.value / max) * H);
                const over = b.value >= YEAR_ONE_COST;
                const on = b.n === pick;
                return (
                  <button
                    key={b.n}
                    onClick={() => setPick(b.n)}
                    aria-pressed={on}
                    aria-label={`${b.n} contracts, ${gbp(b.value)} a year`}
                    className="flex flex-1 flex-col items-center justify-end focus:outline-none"
                  >
                    <span className="mb-1 text-sm font-semibold">{gbp(b.value)}</span>
                    <span
                      className={`w-full rounded-t-lg transition-all duration-500 ${over ? "bg-emerald-400" : "bg-slate-500"} ${on ? "ring-4 ring-white" : "opacity-80"}`}
                      style={{ height: h }}
                    />
                    <span className="mt-1 text-sm">{b.n}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-center text-sm text-slate-300">Contracts won</p>
        </section>

        <section className="rounded-2xl bg-white p-5 text-[#071426]">
          <h2 className="text-xl font-bold">
            With {pick} contract{pick > 1 ? "s" : ""}
          </h2>
          <table className="mt-3 w-full text-left">
            <tbody className="divide-y">
              <tr>
                <td className="py-2">Each contract pays you</td>
                <td className="py-2 text-right font-semibold">{gbp(w)} a week</td>
              </tr>
              <tr>
                <td className="py-2">You keep {m}% of that</td>
                <td className="py-2 text-right font-semibold">{gbp((w * m) / 100)} a week</td>
              </tr>
              <tr>
                <td className="py-2">
                  Times {pick} contract{pick > 1 ? "s" : ""}
                </td>
                <td className="py-2 text-right font-semibold">
                  {gbp((w * m * pick) / 100)} a week
                </td>
              </tr>
              <tr>
                <td className="py-2">Every month (about)</td>
                <td className="py-2 text-right font-semibold">{gbp(sel.value / 12)}</td>
              </tr>
              <tr>
                <td className="py-2">Over a year</td>
                <td className="py-2 text-right font-semibold">{gbp(sel.value)}</td>
              </tr>
              <tr>
                <td className="py-2">Year one cost</td>
                <td className="py-2 text-right font-semibold">- {gbp(YEAR_ONE_COST)}</td>
              </tr>
              <tr className="text-lg">
                <td className="py-3 font-bold">
                  {left >= 0 ? "Left over for you" : "Still to cover"}
                </td>
                <td
                  className={`py-3 text-right font-bold ${left >= 0 ? "text-emerald-700" : "text-slate-600"}`}
                >
                  {gbp(Math.abs(left))}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-sm text-slate-600">
            Year one cost is £2,000 for the 3-month launch (ads, page and set-up included) plus 9
            months of your ops app at £97. That is about £{perDay(YEAR_ONE_COST)} a day.
          </p>
        </section>

        <section className="rounded-2xl bg-emerald-400 p-5 text-center text-[#071426]">
          <p className="text-lg">You need about</p>
          <p className="text-5xl font-bold">{be ?? "-"}</p>
          <p className="text-lg">
            contracts to cover the whole year. Everything after that is yours.
          </p>
        </section>

        <p className="text-sm text-slate-400">
          Examples use your own numbers. We guarantee the work, not a number of contracts.
        </p>
      </div>
    </main>
  );
}
