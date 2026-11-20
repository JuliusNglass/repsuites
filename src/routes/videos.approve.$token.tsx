// The client reads their video script and approves it or asks for changes.
// Sold as Accelur8. No em dashes (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, PencilLine } from "lucide-react";
import { videoScriptDecide, videoScriptRead } from "../lib/video-order.functions";
import { CHANGE_REASONS, FREE_ROUNDS, type VideoScript } from "../lib/video-script";

export const Route = createFileRoute("/videos/approve/$token")({
  head: () => ({
    meta: [{ title: "Your video script | Accelur8" }, { name: "robots", content: "noindex" }],
  }),
  component: ApprovePage,
});

type Loaded =
  | { found: false }
  | { found: true; business: string; status: string; round: number; script: VideoScript };

function ApprovePage() {
  const { token } = Route.useParams();
  const read = useServerFn(videoScriptRead);
  const decide = useServerFn(videoScriptDecide);
  const [o, setO] = useState<Loaded | null>(null);
  const [mode, setMode] = useState<"read" | "change">("read");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    read({ data: { t: token } })
      .then(setO)
      .catch(() => setO({ found: false }));
  }, [token, read]);

  async function send(approve: boolean, form?: HTMLFormElement) {
    setBusy(true);
    setErr(null);
    const fd = form ? new FormData(form) : null;
    const reasons = fd ? fd.getAll("reason").map(String) : [];
    const note = fd ? String(fd.get("note") ?? "") : "";
    const r = await decide({ data: { t: token, approve, reasons, note } }).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) {
      setErr(r && !r.ok ? r.error : "Something went wrong. Please try again.");
      return;
    }
    setResult(
      "message" in r && r.message
        ? r.message
        : r.status === "approved"
          ? "Approved. We are making your video now, in your brand colours. You will hear from us when it is ready."
          : r.status === "resent"
            ? "Thanks. Your updated script is on its way by text and email."
            : "Thanks. We have your notes and will be in touch shortly.",
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground text-base leading-relaxed">
      <header className="border-b border-border/70">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center font-extrabold text-xl tracking-tight">
          Accelur<span className="text-gold">8</span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {!o ? (
          <p className="flex items-center gap-2 font-semibold">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading your script...
          </p>
        ) : !o.found ? (
          <p className="font-semibold">
            We could not find this script. Please use the link in your latest text or email.
          </p>
        ) : result ? (
          <section className="card p-6 space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <p className="flex items-center gap-2 text-xl font-semibold">
              <CheckCircle2 className="h-6 w-6 text-success" aria-hidden /> Done
            </p>
            <p>{result}</p>
          </section>
        ) : (
          <>
            <section className="space-y-2">
              <p className="eyebrow">
                {o.business}
                {o.round > 0 ? ` - version ${o.round + 1}` : ""}
              </p>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                {o.script.title}
              </h1>
              <p className="text-muted-foreground">
                Each scene shows what the voice says and what people will see. The pictures are
                hand-drawn, revealed one by one as she speaks. Nothing is made until you approve.
              </p>
            </section>
            <ol className="space-y-3">
              {o.script.scenes.map((s, i) => (
                <li
                  key={i}
                  className="card p-4 flex gap-4 animate-in fade-in slide-in-from-bottom-2"
                  style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
                >
                  <span
                    aria-hidden
                    className="h-8 w-8 shrink-0 rounded-full bg-gold/20 text-foreground font-bold grid place-items-center"
                  >
                    {i + 1}
                  </span>
                  <div className="space-y-1">
                    <p className="font-semibold">"{s.line}"</p>
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">You see: </span>
                      {s.picture}
                    </p>
                    {s.words && (
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">On screen: </span>
                        {s.words}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {o.status !== "sent" ? (
              <p className="card p-4 font-semibold">We already have your answer. Thank you.</p>
            ) : mode === "read" ? (
              <div className="sticky bottom-0 bg-background/95 backdrop-blur py-4 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send(true)}
                  className="btn btn-gold btn-lg flex-1"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
                  Approve script
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setMode("change")}
                  className="btn btn-outline btn-lg flex-1"
                >
                  <PencilLine className="h-5 w-5" aria-hidden /> Request changes
                </button>
              </div>
            ) : (
              <form
                className="card p-5 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(false, e.currentTarget);
                }}
              >
                <fieldset className="space-y-2">
                  <legend className="font-semibold">
                    What should change? Tick any that apply.
                  </legend>
                  {Object.entries(CHANGE_REASONS).map(([k, label]) => (
                    <label key={k} className="flex items-start gap-3 py-1">
                      <input type="checkbox" name="reason" value={k} className="mt-1 h-5 w-5" />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="block space-y-1">
                  <span className="font-semibold">Tell us more</span>
                  <textarea
                    name="note"
                    rows={4}
                    className="w-full rounded-lg border border-border bg-background px-3 py-3 text-base"
                    placeholder="For example: scene 3 should mention we cover Newport too."
                  />
                </label>
                <p className="text-sm text-muted-foreground">
                  {o.round < FREE_ROUNDS
                    ? `You have ${FREE_ROUNDS - o.round} free ${FREE_ROUNDS - o.round === 1 ? "round" : "rounds"} of changes left. A new version comes back in about a minute.`
                    : "You have used your free rounds. We will read your notes and get back to you."}
                </p>
                {err && (
                  <p role="alert" className="font-semibold text-destructive">
                    {err}
                  </p>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button type="submit" disabled={busy} className="btn btn-gold btn-lg flex-1">
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
                    {busy ? "Rewriting your script" : "Send my changes"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setMode("read")}
                    className="btn btn-outline btn-lg flex-1"
                  >
                    Back
                  </button>
                </div>
              </form>
            )}
            {err && mode === "read" && (
              <p role="alert" className="font-semibold text-destructive">
                {err}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
