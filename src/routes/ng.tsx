// Google Fix-it Pack for Nigerian business owners (/ng), for Lagos Meta ads.
// Teaches first (how Google and AI answers pick businesses), explainer video
// above the fold with a "Watch this first" cue, then two options and checkout.
// Price test: ads link ?p=10 or ?p=20; no param = random 50/50, remembered.
// Branded Accelur8, no personal names. No em dashes (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ArrowDown, Check, ChevronDown, Loader2, Lock, MessageCircle } from "lucide-react";
import { startNgCheckout } from "../lib/fixit-ng.functions";
import {
  NG_DFY_EXTRA_KOBO,
  NG_DIY_KOBO,
  NG_FAQ,
  NG_INCLUDES,
  NG_LESSONS,
  naira,
  nairaPerDay,
  ngAmountKobo,
  pickNgPrice,
  type NgPrice,
  type NgTier,
} from "../lib/fixit-ng";
import { newEventId, trackPixel } from "../lib/meta-pixel";

const INPUT =
  "w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gold";

export const NG_VSL = "/media/ng-fixit-vsl.mp4";
const POSTER = "/media/ng-fixit-vsl.jpg";

export const Route = createFileRoute("/ng")({
  validateSearch: z.object({ p: z.coerce.number().optional() }),
  head: () => ({
    meta: [
      { title: "Get found on Google | Google Fix-it Pack | Accelur8" },
      {
        name: "description",
        content:
          "Customers in Nigeria search Google before they call. See how Google and AI pick which businesses to show, and fix yours in 20 minutes.",
      },
    ],
  }),
  component: NgPage,
});

function usePrice(fromUrl?: number): NgPrice {
  const [p, setP] = useState<NgPrice>(fromUrl === 20 ? 20 : 10);
  useEffect(() => {
    let v: NgPrice;
    if (fromUrl === 10 || fromUrl === 20) v = fromUrl;
    else {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("ng-price");
      } catch {
        /* private mode */
      }
      v = pickNgPrice(saved ?? undefined);
    }
    try {
      localStorage.setItem("ng-price", String(v));
    } catch {
      /* private mode */
    }
    setP(v);
  }, [fromUrl]);
  return p;
}

function NgPage() {
  const { p } = Route.useSearch();
  const price = usePrice(p);
  const [tier, setTier] = useState<NgTier>("diy");
  useEffect(() => trackPixel("ViewContent", { content_name: "Fix-it Pack NG" }, newEventId()), []);
  const diy = NG_DIY_KOBO[price];
  const scrollToBuy = () => document.getElementById("buy")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-background text-foreground text-base leading-relaxed">
      <header className="border-b border-border/70">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold tracking-tight text-lg">Accelur8</span>
          <button type="button" onClick={scrollToBuy} className="btn btn-gold">
            Fix my Google
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-10 space-y-14">
        {/* Above the fold: problem, video with cue, price, button */}
        <section className="grid lg:grid-cols-2 gap-6 lg:gap-10 items-center">
          <div className="space-y-4">
            <p className="inline-block rounded-full bg-gold-soft px-3 py-1 text-sm font-semibold text-primary-ink">
              For business owners in Nigeria
            </p>
            <h1 className="text-3xl sm:text-5xl font-semibold leading-tight">
              When someone near you searches for what you sell, your business should be one of the 3
              they see.
            </h1>
            <p className="text-lg text-muted-foreground">
              Right now those searches go to the 3 businesses Google shows on the map. This 3 minute
              video shows how Google and AI answers pick them, and the 20 minute fix that puts your
              business in the running.
            </p>
            <p className="text-lg">
              <b>Google Fix-it Pack:</b> {naira(diy)} once.{" "}
              <span className="text-primary-ink font-semibold">
                That is {nairaPerDay(diy)} over a year
                {price === 10
                  ? ", less than a sachet of pure water"
                  : ", about one sachet of pure water"}
                .
              </span>
            </p>
            <button
              type="button"
              onClick={scrollToBuy}
              className="btn btn-gold btn-lg w-full sm:w-auto"
            >
              Show me the fix
            </button>
            <p className="text-sm text-muted-foreground">
              Try it on your own profile. Not right? Tell us within 14 days and we rewrite it.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -top-9 left-2 flex items-center gap-2 text-primary-ink font-semibold animate-bounce">
              <span className="rounded-full bg-gold-soft px-3 py-1 text-sm">Watch this first</span>
              <ArrowDown className="h-5 w-5" aria-hidden />
            </div>
            <div className="rounded-2xl overflow-hidden ring-2 ring-gold bg-black aspect-video shadow-xl">
              <video
                className="w-full h-full"
                src={NG_VSL}
                poster={POSTER}
                controls
                playsInline
                preload="metadata"
              >
                <track kind="captions" />
              </video>
            </div>
          </div>
        </section>

        {/* Teach first */}
        <section className="space-y-5">
          <h2 className="text-2xl sm:text-3xl font-semibold">
            How customers really find a business
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {NG_LESSONS.map((l) => (
              <div key={l.title} className="rounded-2xl border border-border p-5 space-y-2">
                <h3 className="font-semibold text-lg">{l.title}</h3>
                <p className="text-muted-foreground">{l.body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-gold-soft/50 p-5">
            <b>Try it now:</b> open Google on your phone and type what you sell plus your area (for
            example "hair salon Lekki"). If you are not in the top 3 on the map, every one of those
            searches is going to someone else today. That is the reason to fix it now, not next
            month.
          </div>
        </section>

        {/* What you get + two options + checkout */}
        <section id="buy" className="grid lg:grid-cols-2 gap-8 scroll-mt-20">
          <div className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold">What you get</h2>
            <ul className="space-y-3">
              {NG_INCLUDES.map((t) => (
                <li key={t} className="flex gap-3">
                  <Check className="h-5 w-5 mt-0.5 text-primary-ink shrink-0" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <p className="flex items-center gap-2 text-muted-foreground">
              <MessageCircle className="h-5 w-5" aria-hidden /> Sent to your WhatsApp and email in
              minutes.
            </p>
          </div>
          <Checkout price={price} tier={tier} setTier={setTier} />
        </section>

        <section className="space-y-3 max-w-3xl">
          <h2 className="text-2xl font-semibold">Questions</h2>
          {NG_FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-xl border border-border p-4">
              <summary className="flex justify-between items-center cursor-pointer font-medium list-none">
                {q}
                <ChevronDown className="h-5 w-5 transition group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-2 text-muted-foreground">{a}</p>
            </details>
          ))}
        </section>
        <p className="text-center text-sm text-muted-foreground">Accelur8</p>
      </main>
    </div>
  );
}

function Checkout({
  price,
  tier,
  setTier,
}: {
  price: NgPrice;
  tier: NgTier;
  setTier: (t: NgTier) => void;
}) {
  const start = useServerFn(startNgCheckout);
  const [f, setF] = useState({ name: "", phone: "", email: "", business: "" });
  const [busy, setBusy] = useState<null | "paystack" | "stripe">(null);
  const [err, setErr] = useState<string | null>(null);
  const total = ngAmountKobo(price, tier);

  async function pay(provider: "paystack" | "stripe") {
    setErr(null);
    if (!f.phone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      setErr("Please add your WhatsApp number and email so we can send your pack.");
      return;
    }
    setBusy(provider);
    trackPixel("InitiateCheckout", { currency: "NGN", value: total / 100 }, newEventId());
    const r = await start({
      data: {
        price,
        tier,
        provider,
        email: f.email.trim(),
        phone: f.phone.trim(),
        ...(f.name.trim() ? { name: f.name.trim() } : {}),
        ...(f.business.trim() ? { business: f.business.trim() } : {}),
      },
    }).catch(() => null);
    if (r?.ok) {
      window.location.href = r.url;
      return;
    }
    setErr(r && !r.ok ? r.error : "Something went wrong. Please try again.");
    setBusy(null);
  }

  const opt = (t: NgTier, title: string, kobo: number, line: string) => (
    <button
      type="button"
      onClick={() => setTier(t)}
      aria-pressed={tier === t}
      className={`text-left rounded-2xl border-2 p-4 transition ${tier === t ? "border-gold bg-gold-soft/40" : "border-border"}`}
    >
      <div className="flex justify-between font-semibold">
        <span>{title}</span>
        <span>{naira(kobo)}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1">{line}</p>
    </button>
  );

  return (
    <div className="rounded-2xl border border-border p-5 space-y-4 shadow-sm">
      <div className="grid gap-3">
        {opt(
          "diy",
          "Do it yourself",
          ngAmountKobo(price, "diy"),
          "Copy and paste it in. About 20 minutes on your phone.",
        )}
        {opt(
          "dfy",
          "Done for you",
          ngAmountKobo(price, "dfy"),
          `We put it all in for you (+${naira(NG_DFY_EXTRA_KOBO)}). No password needed.`,
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          className={INPUT}
          placeholder="Your name"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <input
          className={INPUT}
          placeholder="Business name"
          value={f.business}
          onChange={(e) => setF({ ...f, business: e.target.value })}
        />
        <input
          className={INPUT}
          inputMode="tel"
          placeholder="WhatsApp number"
          value={f.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })}
        />
        <input
          className={INPUT}
          type="email"
          placeholder="Email"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
        />
      </div>
      <button
        type="button"
        onClick={() => pay("paystack")}
        disabled={!!busy}
        className="btn btn-gold btn-lg w-full"
      >
        {busy === "paystack" ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Opening secure payment
          </span>
        ) : (
          `Pay ${naira(total)} now`
        )}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="h-4 w-4" aria-hidden /> Card, bank transfer or USSD by Paystack. One
        payment.
      </p>
      <button
        type="button"
        onClick={() => pay("stripe")}
        disabled={!!busy}
        className="w-full text-sm underline text-muted-foreground"
      >
        {busy === "stripe" ? "Opening..." : "Paying with a card from outside Nigeria? Pay here"}
      </button>
      {err && <p className="text-destructive text-center">{err}</p>}
    </div>
  );
}
