// Client-facing investment vs return reveal, shared on screen during a fit call.
// Numbers come from the URL (?w=weekly&m=margin&n=name&d=homes&dw=homes £/week&r=rate). No personal data stored.
// No em dashes in this copy (AGENTS.md). Branded Accelur8.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { perDay, yearlyProfit } from "../lib/call-sheet";

export const Route = createFileRoute("/reveal")({
  head: () => ({
    meta: [{ title: "Your contract plan | Accelur8" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    w: Number(s["w"]) > 0 ? Number(s["w"]) : 100,
    m: Number(s["m"]) > 0 ? Number(s["m"]) : 25,
    k: [1, 2, 3, 4, 5].includes(Number(s["k"])) ? Number(s["k"]) : 3,
    n: typeof s["n"] === "string" ? s["n"].slice(0, 40) : "",
    // Their business today: regular clients, what those bring in a week, hourly rate.
    d: Number(s["d"]) > 0 ? Math.round(Number(s["d"])) : 0,
    dw: Number(s["dw"]) > 0 ? Number(s["dw"]) : 0,
    r: Number(s["r"]) > 0 ? Number(s["r"]) : 0,
  }),
  component: Reveal,
});

const gbp = (v: number) => `£${Math.round(v).toLocaleString("en-GB")}`;

function Reveal() {
  const s = Route.useSearch();
  const [w, setW] = useState(s.w);
  const [m, setM] = useState(s.m);
  const [pick, setPick] = useState(s.k);
  const [plan, setPlan] = useState<"full" | "monthly">("full");
  const launch = plan === "full" ? 2000 : 2100;
  const appCost = 9 * 97;
  const cost = launch + appCost;
  const per = yearlyProfit(w, m);
  const be = per ? Math.round((cost / per) * 10) / 10 : null;
  const bars = useMemo(() => [1, 2, 3, 4, 5].map((n) => ({ n, value: per * n })), [per]);
  const max = Math.max(cost, ...bars.map((b) => b.value)) * 1.1;
  const sel = bars.find((b) => b.n === pick) ?? bars[2]!;
  const left = sel.value - cost;
  const perHome = s.d > 0 && s.dw > 0 ? s.dw / s.d : 0;
  const homes = perHome > 0 && w > 0 ? Math.round((w / perHome) * 10) / 10 : 0;
  const H = 200;
  const costY = H - (cost / max) * H;

  return (
    <main className="min-h-screen bg-[#071426] px-3 py-4 text-base leading-relaxed text-white sm:px-4 lg:py-3">
      <div className="mx-auto grid max-w-[1500px] gap-3 lg:grid-cols-4 lg:gap-3">
        <header className="lg:col-span-3">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-300">Accelur8</p>
          <h1 className="mt-1 text-2xl font-bold lg:text-3xl">
            {s.n ? `${s.n}, here's your contract plan` : "Your contract plan"}
          </h1>
          <p className="mt-2 text-slate-300">
            What small office contracts could add to your year, against what it costs to get
            started.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 self-end rounded-2xl bg-white/5 p-3">
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

        {perHome > 0 && (
          <section className="grid gap-3 rounded-2xl bg-white/5 p-3 sm:grid-cols-3 lg:col-span-4">
            <div>
              <p className="text-sm text-slate-300">Your business today</p>
              <p className="text-2xl font-bold">
                {s.d} regular homes, {gbp(s.dw)} a week
              </p>
              <p className="text-sm text-slate-300">About {gbp(perHome)} a week each</p>
            </div>
            <div>
              <p className="text-sm text-slate-300">One small office</p>
              <p className="text-2xl font-bold">{gbp(w)} a week</p>
              <p className="text-sm text-slate-300">
                {s.r
                  ? `About 2 hours, 3 times a week, at your ${gbp(s.r)} an hour`
                  : "One key, one invoice"}
              </p>
            </div>
            <div className="rounded-xl bg-amber-300 p-3 text-[#071426]">
              <p className="text-sm font-semibold">That's like adding</p>
              <p className="text-3xl font-bold">{homes} homes</p>
              <p className="text-sm">from one client, cleaned while the building is empty</p>
            </div>
          </section>
        )}

        <section className="min-w-0 overflow-hidden rounded-2xl bg-white/5 p-4">
          <h2 className="text-xl font-bold">Money kept in a year, by number of contracts</h2>
          <p className="text-sm text-slate-300">
            Each bar is money you keep. Tap one to see how it adds up. Bars above the yellow line
            more than cover what you invest in year one.
          </p>
          <div
            className="relative mt-4"
            style={{ height: H + 28 }}
            role="group"
            aria-label="Contracts chart"
          >
            <div
              className="absolute inset-x-0 z-10 pointer-events-none border-t-[3px] border-dashed border-amber-300"
              style={{ top: costY }}
            ></div>
            <div className="flex h-full items-end gap-2 sm:gap-4">
              {bars.map((b) => {
                const h = Math.max(4, (b.value / max) * H);
                const over = b.value >= cost;
                const on = b.n === pick;
                return (
                  <button
                    key={b.n}
                    onClick={() => setPick(b.n)}
                    aria-pressed={on}
                    aria-label={`${b.n} contracts, ${gbp(b.value)} a year`}
                    className="flex min-w-0 flex-1 flex-col items-center justify-end focus:outline-none"
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
          <p className="mt-1 flex items-center justify-center gap-2 text-sm text-slate-300">
            <span className="inline-block w-6 border-t-[3px] border-dashed border-amber-300" />
            Year one cost {gbp(cost)}
          </p>
        </section>

        <section className="rounded-2xl bg-white p-4 text-[#071426]">
          <h2 className="text-xl font-bold">
            What you earn with {pick} office contract{pick > 1 ? "s" : ""}
          </h2>
          <p className="text-sm text-slate-600">This is money coming in to you, not a cost.</p>
          <table className="mt-3 w-full text-left">
            <tbody className="divide-y">
              <tr>
                <td className="py-2">Each office pays you</td>
                <td className="py-2 text-right font-semibold">{gbp(w)} a week</td>
              </tr>
              <tr>
                <td className="py-2">After wages and products, you keep {m}% of each one</td>
                <td className="py-2 text-right font-semibold">{gbp((w * m) / 100)} a week</td>
              </tr>
              <tr>
                <td className="py-2">
                  From {pick} office{pick > 1 ? "s" : ""}, you keep
                </td>
                <td className="py-2 text-right font-semibold">
                  {gbp((w * m * pick) / 100)} a week
                </td>
              </tr>
              <tr>
                <td className="py-2">That is about</td>
                <td className="py-2 text-right font-semibold">{gbp(sel.value / 12)} a month</td>
              </tr>
              <tr className="text-lg">
                <td className="py-3 font-bold">Kept over 12 months</td>
                <td className="py-3 text-right font-bold text-emerald-700">{gbp(sel.value)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl bg-white p-4 text-[#071426]">
          <h2 className="text-xl font-bold">What you invest in year one</h2>
          <div className="mt-3 flex gap-2" role="group" aria-label="How you pay">
            <button
              onClick={() => setPlan("full")}
              aria-pressed={plan === "full"}
              className={`rounded-lg px-4 py-2 font-semibold ${plan === "full" ? "bg-[#071426] text-white" : "bg-slate-100"}`}
            >
              Pay in full
            </button>
            <button
              onClick={() => setPlan("monthly")}
              aria-pressed={plan === "monthly"}
              className={`rounded-lg px-4 py-2 font-semibold ${plan === "monthly" ? "bg-[#071426] text-white" : "bg-slate-100"}`}
            >
              3 monthly payments
            </button>
          </div>
          <table className="mt-3 w-full text-left">
            <tbody className="divide-y">
              <tr>
                <td className="py-2">
                  <b>Months 1 to 3: the launch</b>
                  <br />
                  <span className="text-sm text-slate-600">
                    £900 of ads to win office contracts, your page, set-up and your ops app, all
                    included
                  </span>
                </td>
                <td className="py-2 text-right font-semibold">
                  {plan === "full" ? "£2,000" : "3 x £700 = £2,100"}
                </td>
              </tr>
              <tr>
                <td className="py-2">
                  <b>Months 4 to 12: your ops app</b>
                  <br />
                  <span className="text-sm text-slate-600">
                    Keeps your quotes, cleans and staff running
                  </span>
                </td>
                <td className="py-2 text-right font-semibold">9 x £97 = {gbp(appCost)}</td>
              </tr>
              <tr className="text-lg">
                <td className="py-3 font-bold">Total for the year</td>
                <td className="py-3 text-right font-bold">{gbp(cost)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-sm text-slate-600">
            About £{perDay(cost)} a day. The launch is a one-off. The contracts you win keep paying
            you after it ends.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-4 text-[#071426]">
          <h2 className="text-xl font-bold">Putting it together</h2>
          <table className="mt-3 w-full text-left">
            <tbody className="divide-y">
              <tr>
                <td className="py-2">
                  Kept from {pick} office{pick > 1 ? "s" : ""} over 12 months
                </td>
                <td className="py-2 text-right font-semibold">{gbp(sel.value)}</td>
              </tr>
              <tr>
                <td className="py-2">Minus what you invest in year one</td>
                <td className="py-2 text-right font-semibold">- {gbp(cost)}</td>
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
          <p className="mt-2 text-sm text-slate-600">
            From year two, there is no launch fee. You only pay £97 a month for the app.
          </p>
        </section>

        <section className="rounded-2xl bg-emerald-400 p-3 text-center text-[#071426] lg:col-span-4">
          {be !== null && be <= 1 ? (
            <>
              <p className="text-5xl font-bold">Just 1 contract</p>
              <p className="text-lg">
                covers your whole first year, with {gbp(per - cost)} left over for you.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg">You need</p>
              <p className="text-5xl font-bold">{be === null ? "-" : Math.ceil(be)} contracts</p>
              <p className="text-lg">to cover the whole year. Everything after that is yours.</p>
            </>
          )}
        </section>

        <p className="text-sm text-slate-400 lg:col-span-4">
          Examples use your own numbers. We guarantee the work, not a number of contracts.
        </p>
      </div>
    </main>
  );
}
