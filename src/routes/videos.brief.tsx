// After paying for explainer videos: the brief. Sold as Accelur8.
// No em dashes (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { videoBrief, videoState } from "../lib/video-order.functions";
import { VIDEO_GOALS, VIDEO_PACKS, type VideoPack } from "../lib/video-order";

export const Route = createFileRoute("/videos/brief")({
  validateSearch: z.object({ s: z.string().max(260).optional() }),
  head: () => ({
    meta: [{ title: "Your video brief | Accelur8" }, { name: "robots", content: "noindex" }],
  }),
  component: BriefPage,
});

type State =
  | { status: "loading" | "missing" | "waiting" }
  | { status: "ready"; pack: VideoPack; name: string; phone: string };

const field = "w-full rounded-lg border border-border bg-background px-3 py-3 text-base";

function BriefPage() {
  const { s = "" } = Route.useSearch();
  const state = useServerFn(videoState);
  const send = useServerFn(videoBrief);
  const [st, setSt] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let tries = 0;
    let stop = false;
    async function check() {
      const r = await state({ data: { s } }).catch(() => ({ status: "missing" as const }));
      if (stop) return;
      if (r.status === "waiting" && tries++ < 10) {
        setSt(r);
        setTimeout(() => void check(), 2000);
        return;
      }
      setSt(r as State);
    }
    if (/^cs_/.test(s)) void check();
    else setSt({ status: "missing" });
    return () => {
      stop = true;
    };
  }, [s, state]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const brief: Record<string, string> = {};
    fd.forEach((v, k) => (brief[k] = String(v)));
    const r = await send({ data: { s, brief } }).catch(() => null);
    setBusy(false);
    if (r?.ok) setDone(true);
    else setErr(r && !r.ok ? r.error : "Something went wrong. Please try again.");
  }

  return (
    <div className="min-h-screen bg-background text-foreground text-base leading-relaxed">
      <header className="border-b border-border/70">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center font-extrabold text-xl tracking-tight">
          Accelur<span className="text-gold">8</span>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
        {st.status === "loading" || st.status === "waiting" ? (
          <p className="flex items-center gap-2 font-semibold">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Checking your payment...
          </p>
        ) : st.status === "missing" ? (
          <p className="font-semibold">
            We could not find your order. If you have paid, please reply to your payment receipt
            email and we will sort it out.
          </p>
        ) : done ? (
          <section className="card p-6 space-y-3">
            <p className="flex items-center gap-2 text-xl font-semibold">
              <CheckCircle2 className="h-6 w-6 text-success" aria-hidden /> Thank you, we have your
              brief
            </p>
            <p>
              Your script is on its way by text and email. Nothing is made until you approve it.
            </p>
          </section>
        ) : st.status === "ready" ? (
          <>
            <section className="space-y-2">
              <p className="eyebrow">Payment received: {VIDEO_PACKS[st.pack].label}</p>
              <h1 className="text-3xl font-semibold">Tell us about your business</h1>
              <p className="text-muted-foreground">
                About 5 minutes. We use this to write your script.
              </p>
            </section>
            <form onSubmit={(e) => void submit(e)} className="space-y-5">
              <label className="block space-y-1">
                <span className="font-semibold">Your name</span>
                <input
                  name="name"
                  required
                  defaultValue={st.name}
                  className={field}
                  autoComplete="name"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold">Business name</span>
                <input name="business" required className={field} autoComplete="organization" />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold">Mobile number</span>
                <input
                  name="phone"
                  defaultValue={st.phone}
                  className={field}
                  autoComplete="tel"
                  inputMode="tel"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold">Website or social page (optional)</span>
                <input name="site" className={field} />
              </label>
              {[1, 2, 3].map((n) => (
                <label key={n} className="block space-y-1">
                  <span className="font-semibold">
                    Ideal customer {n}
                    {n > 1 ? " (optional)" : ""}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    Who are they, what problem do they have, and what worries them about buying?
                  </span>
                  <textarea name={`c${n}`} required={n === 1} rows={3} className={field} />
                </label>
              ))}
              <fieldset className="space-y-2">
                <legend className="font-semibold">What should the videos do?</legend>
                {Object.entries(VIDEO_GOALS).map(([k, v]) => (
                  <label
                    key={k}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <input type="radio" name="goal" value={k} required className="h-5 w-5" /> {v}
                  </label>
                ))}
              </fieldset>
              <label className="block space-y-1">
                <span className="font-semibold">Brand colours, characters or style (optional)</span>
                <span className="block text-sm text-muted-foreground">
                  For example: navy and gold, a friendly woman cleaner, our logo is a bee.
                </span>
                <textarea name="brand" rows={2} className={field} />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold">Anything else we should know? (optional)</span>
                <textarea name="notes" rows={3} className={field} />
              </label>
              {err && (
                <p role="alert" className="font-semibold text-destructive">
                  {err}
                </p>
              )}
              <button type="submit" disabled={busy} className="btn btn-gold btn-lg w-full">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
                {busy ? "Writing your script, about a minute" : "Send my brief"}
              </button>
            </form>
          </>
        ) : null}
      </main>
    </div>
  );
}
