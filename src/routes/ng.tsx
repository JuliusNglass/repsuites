// Google Fix-it Pack for Nigerian business owners (/ng), for Lagos Meta ads.
// Teaches first (how Google and AI answers pick businesses), explainer video
// above the fold with a "Watch this first" cue, then two options and checkout.
// Price test: ads link ?p=10 or ?p=20; no param = random 50/50, remembered.
// Branded Accelur8, no personal names. No em dashes (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  MessageCircle,
} from "lucide-react";
import { startNgCheckout } from "../lib/fixit-ng.functions";
import {
  NG_DFY_EXTRA_KOBO,
  NG_DIY_KOBO,
  NG_FAQ,
  NG_INCLUDES,
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
      { title: "Why is your competitor getting all the calls? | Accelur8" },
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
  const heroEnd = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const el = heroEnd.current;
      setShowBar(!!el && el.getBoundingClientRect().bottom < 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const scrollToBuy = () => document.getElementById("buy")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-background text-foreground text-base leading-relaxed">
      <header className="border-b border-border/70">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold tracking-tight text-lg">Accelur8</span>
          <button
            type="button"
            onClick={scrollToBuy}
            className="btn btn-gold hidden sm:inline-flex"
          >
            Fix my Google
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-10 space-y-14 pb-28 sm:pb-10">
        {/* Above the fold: one question, a picture of the map, the video, one button */}
        <section className="grid lg:grid-cols-2 gap-x-10 gap-y-6 items-center">
          <div className="space-y-3 lg:col-start-1">
            <p className="inline-block rounded-full bg-gold-soft px-3 py-1 text-sm font-semibold text-primary-ink">
              For business owners in Nigeria
            </p>
            <h1 className="text-4xl sm:text-5xl font-semibold leading-tight">
              Why is the business down the road{" "}
              <span className="text-primary-ink">getting all the calls?</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Google shows only 3 businesses at the top of the map, and those 3 get most of the
              calls. If you are not one of them, those customers are calling someone else. Watch
              this 2 minute video to see why.
            </p>
          </div>

          <div
            ref={heroEnd}
            className="relative mt-10 mb-2 lg:my-0 lg:col-start-2 lg:row-start-1 lg:row-span-2"
          >
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
          <div className="space-y-5 lg:col-start-1">
            <button
              type="button"
              onClick={scrollToBuy}
              className="btn btn-gold btn-lg w-full sm:w-auto"
            >
              Fix my Google profile - {naira(diy)}
            </button>
            <p className="text-sm text-muted-foreground">
              {nairaPerDay(diy)} over a year
              {price === 10
                ? ", less than a sachet of pure water"
                : ", about a sachet of pure water"}
              . Not right? We rewrite it free within 14 days.
            </p>
            <a
              href="/check?n=ng&src=ng"
              className="flex items-center justify-between rounded-xl border-2 border-dashed border-gold px-4 py-3 font-semibold text-primary-ink hover:bg-gold-soft/40 transition"
            >
              Not sure? Get a free Google check first
              <ArrowRight className="h-5 w-5" aria-hidden />
            </a>
          </div>
        </section>

        {/* Three pictures, three short lines */}
        <section className="space-y-5">
          <h2 className="text-2xl sm:text-3xl font-semibold">How the top 3 get picked</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {STEPS.map((st, i) => (
              <figure
                key={st.img}
                className="rounded-2xl border border-border overflow-hidden bg-white transition hover:-translate-y-1 hover:shadow-lg"
              >
                <img
                  src={st.img}
                  alt=""
                  loading="lazy"
                  className="w-full aspect-[2/1] object-contain bg-white"
                />
                <figcaption className="p-4">
                  <span className="text-sm font-semibold text-primary-ink">Step {i + 1}</span>
                  <p className="font-semibold text-lg leading-snug">{st.line}</p>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="rounded-2xl bg-primary-ink text-white p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-lg">
              <b>Test it now:</b> search "what you sell + your area" on Google. Not in the top 3?
            </p>
            <button type="button" onClick={scrollToBuy} className="btn btn-gold shrink-0">
              Fix it today
            </button>
          </div>
        </section>

        {/* What you get + two options + checkout */}
        <section id="buy" className="grid lg:grid-cols-2 gap-8 scroll-mt-20">
          <div className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold">Your Fix-it Pack</h2>
            <ul className="space-y-3">
              {NG_INCLUDES.map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="h-7 w-7 rounded-full bg-gold-soft grid place-items-center shrink-0">
                    <Check className="h-4 w-4 text-primary-ink" aria-hidden />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <p className="flex items-center gap-2 text-muted-foreground">
              <MessageCircle className="h-5 w-5" aria-hidden /> On your WhatsApp and email in
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

      {/* Sticky button on phones, only once the reader has seen the video and the offer */}
      <div
        className={`${showBar ? "translate-y-0" : "translate-y-full"} transition-transform duration-300 sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur p-3`}
      >
        <button type="button" onClick={scrollToBuy} className="btn btn-gold btn-lg w-full">
          Fix my Google profile - {naira(diy)}
        </button>
      </div>
    </div>
  );
}

const STEPS = [
  { img: "/media/ng-n13.webp", line: "Customers search Google before they call." },
  { img: "/media/ng-04.webp", line: "Google shows 3 businesses on the map. They get the calls." },
  { img: "/media/ng-n15.webp", line: "Fix your profile and the next call can be yours." },
];

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
        <Lock className="h-4 w-4" aria-hidden /> Secure payment. One payment, no subscription.
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
