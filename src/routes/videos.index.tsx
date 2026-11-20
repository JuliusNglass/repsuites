// Accelur8 explainer video service: sales page with VSL, prices and FAQ.
// Buying opens Stripe; after paying the buyer fills in /videos/brief.
// Sold as Accelur8 (no RepSuites branding). No em dashes (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { videoStart } from "../lib/video-order.functions";

export const Route = createFileRoute("/videos/")({
  head: () => ({
    meta: [
      { title: "Explainer videos for your business, no face needed | Accelur8" },
      {
        name: "description",
        content:
          "Short hand-drawn explainer videos that show your ideal customer why you are the right choice. From £50.",
      },
    ],
  }),
  component: VideosPage,
});

const INCLUDED = [
  "Script written for your ideal customer",
  "You approve it first, with 2 rounds of edits",
  "Hand-drawn style, no face on camera",
  "Professional voiceover, captions and music",
  "Ready for Facebook, Instagram, TikTok or your website",
  "Yours to keep, no watermark",
];

const FAQ = [
  [
    "Do I have to appear on camera?",
    "No. The videos are hand-drawn with a voiceover. You never have to show your face.",
  ],
  [
    "What do you need from me?",
    "After you pay, you fill in a short brief: your business, up to 3 ideal customers, and what you want the videos to do. It takes about 5 minutes.",
  ],
  [
    "What if I don't like the script?",
    "Nothing is made until you approve the script. You get 2 rounds of edits, so you can change the words until they sound right.",
  ],
  [
    "Can I get a refund?",
    "No. But nothing is made until you have approved the script, so there are no surprises.",
  ],
  [
    "Where can I use the videos?",
    "Anywhere you like: Facebook, Instagram, TikTok, YouTube, your website or adverts. They are yours.",
  ],
  [
    "How long are the videos?",
    "Usually 30 to 60 seconds, which is the length that works best on social media.",
  ],
] as const;

function BuyButton({
  pack,
  children,
  gold,
}: {
  pack: "one" | "three";
  children: React.ReactNode;
  gold?: boolean;
}) {
  const start = useServerFn(videoStart);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    const r = await start({ data: { pack } }).catch(() => null);
    if (r?.ok) {
      window.location.href = r.url;
      return;
    }
    setBusy(false);
    setErr(r && !r.ok ? r.error : "Something went wrong. Please try again.");
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void go()}
        className={`btn btn-lg w-full ${gold ? "btn-gold" : "btn-navy"}`}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
        {busy ? "Opening secure payment" : children}
      </button>
      {err && (
        <p role="alert" className="font-semibold text-destructive">
          {err}
        </p>
      )}
    </div>
  );
}

function VideosPage() {
  return (
    <div className="min-h-screen bg-background text-foreground text-base leading-relaxed">
      <header className="border-b border-border/70">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center font-extrabold text-xl tracking-tight">
          Accelur<span className="text-gold">8</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10 sm:py-14 space-y-12">
        <section className="space-y-5 text-left sm:text-center">
          <p className="eyebrow">For small business owners who hate being on camera</p>
          <h1 className="text-3xl sm:text-5xl font-semibold leading-tight">
            Get seen by the right customers, without showing your face.
          </h1>
          <p className="text-lg text-muted-foreground">
            Short hand-drawn explainer videos that show your ideal customer why you are the right
            choice.
          </p>
          <p className="font-semibold animate-bounce" aria-hidden>
            ↓ Watch this first (under 2 minutes)
          </p>
          <video
            className="w-full rounded-2xl border border-border shadow-lg"
            src="/media/explainer-service-vsl.mp4"
            poster="/media/explainer-service-vsl.jpg"
            controls
            playsInline
            preload="metadata"
          />
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="card p-6 space-y-4">
            <p className="eyebrow">1 video</p>
            <p className="text-4xl font-semibold">£50</p>
            <p className="text-muted-foreground">
              Less than one boosted post that is gone in a day.
            </p>
            <BuyButton pack="one">Get 1 video for £50</BuyButton>
          </div>
          <div className="card p-6 space-y-4 ring-2 ring-gold">
            <p className="eyebrow">Best value: 3 videos</p>
            <p className="text-4xl font-semibold">£100</p>
            <p className="text-muted-foreground">
              About £33 a video. £100 ÷ 3 = £33.33, so you save almost £17 each.
            </p>
            <BuyButton pack="three" gold>
              Get 3 videos for £100
            </BuyButton>
          </div>
        </section>

        <section className="card p-6 space-y-3">
          <h2 className="text-2xl font-semibold">What you get</h2>
          <ul className="space-y-2">
            {INCLUDED.map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check className="h-5 w-5 mt-1 flex-none text-success" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <ol className="space-y-3">
            {[
              "Pay securely by card.",
              "Fill in a short brief about your business and ideal customers.",
              "We send you the script. You approve it or ask for changes.",
              "You get your finished videos, ready to post.",
            ].map((t, i) => (
              <li key={t} className="flex items-start gap-3">
                <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gold-soft font-semibold">
                  {i + 1}
                </span>
                <span className="pt-1">{t}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Questions</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className="card p-4 group">
              <summary className="flex cursor-pointer items-center justify-between gap-3 font-semibold list-none">
                {q}
                <ChevronDown
                  className="h-5 w-5 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="pt-2 text-muted-foreground">{a}</p>
            </details>
          ))}
        </section>

        <section className="card p-6 space-y-4 text-left sm:text-center">
          <h2 className="text-2xl font-semibold">Ready to be seen?</h2>
          <BuyButton pack="three" gold>
            Get 3 videos for £100
          </BuyButton>
          <BuyButton pack="one">Or 1 video for £50</BuyButton>
        </section>
      </main>
      <footer className="border-t border-border/70 py-6 text-center text-sm text-muted-foreground">
        Accelur8, Springboard Business Innovation Centre, Cwmbran NP44 3AW
      </footer>
    </div>
  );
}
