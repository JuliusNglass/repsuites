// Free Google Check funnel landing page (/check). One job per screen:
// 1) find and confirm your business, 2) a scan runs while you leave your
// details, 3) you land on your report. No menu, so nothing pulls people away.
// The niche (?n=cleaning) only changes the words; the scan works for any
// local business. No em dashes in this copy (AGENTS.md).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Check, Loader2, Lock, MapPin, Star } from "lucide-react";
import { Logo } from "../components/site/Logo";
import { BusinessSearch } from "../components/site/BusinessSearch";
import type { BusinessDetails } from "../lib/places.functions";
import { prebuildCheck, requestVisibilityCheck } from "../lib/leads.functions";
import type { Headache, Size } from "../lib/ghl-lead";

type Niche = {
  headline: string;
  sub: string;
  team: string;
  sizes: [Size, string][];
  headaches: [Headache, string][];
  /** What most customers type into Google; they can change it. */
  keyword: string;
  keywordHint: string;
};

const NICHES: Record<string, Niche> = {
  cleaning: {
    headline: "Are regular clients finding you on Google, or your competitors?",
    sub: "The free 30-second Cleaning Business Google Check. See your score, your top gaps and how you compare with cleaning firms near you.",
    team: "How many cleaners do you have?",
    sizes: [
      ["solo", "Just me"],
      ["2-5", "2 to 5"],
      ["6-15", "6 to 15"],
      ["16-25", "16 to 25"],
      ["25+", "More than 25"],
    ],
    headaches: [
      ["clients", "Getting the right clients"],
      ["admin", "Admin and chasing"],
      ["hiring", "Hiring and keeping cleaners"],
      ["checking", "Checking the work is done right"],
      ["other", "Something else"],
    ],
    keyword: "cleaning company",
    keywordHint: "For example: cleaners, office cleaning, end of tenancy cleaning",
  },
  general: {
    headline: "Are customers finding you on Google, or your competitors?",
    sub: "The free 30-second Google Check. See your score, your top gaps and how you compare with businesses near you.",
    team: "How many people work in the business?",
    sizes: [
      ["solo", "Just me"],
      ["2-5", "2 to 5"],
      ["6-15", "6 to 15"],
      ["16-25", "16 to 25"],
      ["25+", "More than 25"],
    ],
    headaches: [
      ["clients", "Getting more of the right customers"],
      ["admin", "Admin and chasing"],
      ["hiring", "Hiring and keeping staff"],
      ["checking", "Keeping quality consistent"],
      ["other", "Something else"],
    ],
    keyword: "",
    keywordHint: "For example: plumber, dentist, hair salon",
  },
};

export const Route = createFileRoute("/check")({
  validateSearch: z.object({
    n: z.string().max(30).optional(),
    src: z.string().max(30).optional(),
    utm_source: z.string().max(60).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Free Google Check | RepSuites" },
      {
        name: "description",
        content:
          "See how your business looks on Google in 30 seconds. Free score, top gaps and a local comparison.",
      },
    ],
  }),
  component: CheckPage,
});

const SCAN_STEPS = [
  "Finding your Google profile",
  "Counting reviews and how recent they are",
  "Checking photos, hours and contact details",
  "Comparing you with businesses near you",
  "Checking where you show on Google Maps",
  "Writing up your top gaps",
];

const input = "field text-base";

// A roomy tick-box row: the whole card is the tap target.
const tick =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 transition-colors hover:bg-secondary has-[:checked]:border-navy/60 has-[:checked]:bg-gold-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--ring)]";

const PROMISES = [
  "Your score out of 100",
  "Your top gaps, in plain English",
  "How you compare with businesses near you",
];

function CheckPage() {
  const { n, src, utm_source } = Route.useSearch();
  const niche = NICHES[n ?? "cleaning"] ?? NICHES["general"]!;
  const nicheKey = NICHES[n ?? "cleaning"] ? (n ?? "cleaning") : "general";
  const send = useServerFn(requestVisibilityCheck);

  const [business, setBusiness] = useState("");
  const [place, setPlace] = useState<BusinessDetails | null>(null);
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: "", email: "", phone: "", website: "" });
  const [size, setSize] = useState<Size | "">("");
  const [headaches, setHeadaches] = useState<Headache[]>([]);
  const [keyword, setKeyword] = useState(niche.keyword);
  const prebuild = useServerFn(prebuildCheck);
  // The report build starts the moment they confirm their business.
  const built = useRef<Promise<string | null> | null>(null);
  const [cEmail, setCEmail] = useState(false);
  const [cWa, setCWa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The scan preview ticks through while they fill in the form.
  useEffect(() => {
    if (!place) {
      built.current = null;
      return;
    }
    built.current = prebuild({
      data: { placeId: place.placeId, ...(keyword.trim() ? { keyword: keyword.trim() } : {}) },
    })
      .then((r) => (r.ok ? r.token : null))
      .catch(() => null);
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, SCAN_STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, [place]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!place) return;
    if (!headaches.length) {
      setErr("Please tick at least one headache.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const token = await (built.current ?? Promise.resolve(null));
      const r = await send({
        data: {
          name: f.name,
          business: place.name || business,
          town: place.town,
          email: f.email,
          phone: f.phone,
          website: f.website,
          source: (src || utm_source || "direct").slice(0, 30),
          niche: nicheKey,
          size: size || null,
          headaches,
          keyword: keyword.trim(),
          ...(token ? { prebuiltToken: token } : {}),
          consentEmail: cEmail,
          consentWhatsapp: cWa,
          place: {
            placeId: place.placeId,
            address: place.address,
            rating: place.rating,
            reviewCount: place.reviewCount,
            websiteUrl: place.website,
            mapsUrl: place.mapsUrl,
          },
        },
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      if (r.reportUrl) window.location.href = r.reportUrl.replace("https://repsuites.com", "");
      else
        setErr(
          "Your details are saved. We could not finish the scan, so we will email your results shortly.",
        );
    } catch {
      setErr("Please check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col text-base leading-relaxed">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md backdrop-saturate-150">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Logo />
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" aria-hidden /> Free and private
          </p>
        </div>
      </header>

      <main className="flex-1 w-full">
        {!place ? (
          <section
            aria-labelledby="h1"
            className="relative overflow-x-clip bg-[radial-gradient(90%_60%_at_100%_0%,var(--gold-soft),transparent_65%)]"
          >
            <div className="max-w-6xl mx-auto px-4 pt-8 pb-14 sm:pt-14 sm:pb-20 lg:py-20 grid gap-8 lg:gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-start">
              <div className="space-y-5 max-w-xl lg:pt-6">
                <p className="eyebrow">
                  <span className="h-px w-6 bg-primary-ink" aria-hidden /> Free 30-second check
                </p>
                <h1
                  id="h1"
                  className="text-[2rem] leading-[1.12] sm:text-5xl lg:text-[3.25rem] font-semibold sm:leading-[1.08]"
                >
                  {niche.headline}
                </h1>
                <p className="text-lg text-muted-foreground">{niche.sub}</p>
                <ul className="hidden lg:grid gap-3 pt-2">
                  {PROMISES.map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold-soft ring-1 ring-primary/40">
                        <Check className="h-4 w-4 text-primary-ink" aria-hidden />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative w-full max-w-xl lg:max-w-none">
                <div
                  className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-primary/25 via-transparent to-navy/15 blur-2xl"
                  aria-hidden
                />
                <div className="relative z-10 rounded-3xl border border-border bg-card shadow-[var(--shadow-lift)]">
                  <div className="surface-navy rounded-t-3xl px-5 py-4 sm:px-6">
                    <p className="text-sm font-bold uppercase tracking-[0.08em] text-primary">
                      Start your check
                    </p>
                    <p className="mt-1 font-display text-xl font-semibold text-white">
                      Find your business
                    </p>
                  </div>
                  <div className="p-5 sm:p-6 space-y-5">
                    <div className="space-y-1.5">
                      <label htmlFor="kw" className="block font-bold">
                        What do customers type into Google to find you?
                      </label>
                      <input
                        id="kw"
                        name="keyword"
                        required
                        className={input}
                        value={keyword}
                        maxLength={60}
                        autoComplete="off"
                        onChange={(e) => setKeyword(e.target.value)}
                        aria-describedby="kw-hint"
                      />
                      <p id="kw-hint" className="text-muted-foreground">
                        {niche.keywordHint}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <BusinessSearch
                        value={business}
                        onChange={setBusiness}
                        confirmed={place}
                        onConfirm={setPlace}
                      />
                      <p className="text-muted-foreground">
                        Type your business name and town, then pick it from the list.
                      </p>
                    </div>
                  </div>
                </div>
                <ul className="mt-6 grid gap-3 lg:hidden">
                  {PROMISES.map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold-soft ring-1 ring-primary/40">
                        <Check className="h-4 w-4 text-primary-ink" aria-hidden />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : (
          <section
            aria-labelledby="h2"
            className="bg-[radial-gradient(90%_40%_at_100%_0%,var(--gold-soft),transparent_65%)]"
          >
            <div className="max-w-6xl mx-auto px-4 pt-6 pb-14 sm:pt-12 sm:pb-20 grid gap-6 lg:gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-start">
              <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)] lg:sticky lg:top-24">
                <div className="surface-navy px-5 py-5 sm:px-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold uppercase tracking-[0.08em] text-primary">
                        Your business
                      </p>
                      <p className="mt-1 font-display text-xl sm:text-2xl font-semibold text-white break-words">
                        {place.name}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-white/85">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">{place.town || place.address}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPlace(null)}
                      className="btn shrink-0 border border-white/30 bg-white/10 px-4 text-white hover:bg-white/20 focus-visible:outline-white"
                    >
                      Change<span className="sr-only"> business</span>
                    </button>
                  </div>
                  {place.rating != null && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-white ring-1 ring-white/15">
                      <Star className="h-4 w-4 fill-primary text-primary" aria-hidden />
                      <span className="tabular-nums">{place.rating}</span> from{" "}
                      {place.reviewCount ?? 0} reviews
                    </p>
                  )}
                </div>
                <div className="p-5 sm:p-6">
                  <p className="eyebrow">Your scan is running</p>
                  <ol className="mt-3 space-y-2.5" aria-live="polite">
                    {SCAN_STEPS.map((s, i) => (
                      <li
                        key={s}
                        className={`flex items-center gap-3 ${i > step ? "text-muted-foreground" : "font-semibold"}`}
                      >
                        {i < step ? (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-white">
                            <Check className="h-4 w-4" aria-hidden />
                          </span>
                        ) : i === step ? (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-soft ring-1 ring-primary/50">
                            <Loader2
                              className="h-4 w-4 animate-spin text-primary-ink"
                              aria-hidden
                            />
                          </span>
                        ) : (
                          <span
                            className="h-6 w-6 shrink-0 rounded-full border-2 border-border"
                            aria-hidden
                          />
                        )}
                        <span>
                          {s}
                          <span className="sr-only">
                            {i < step ? " (done)" : i === step ? " (in progress)" : ""}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <form onSubmit={submit} className="card p-5 sm:p-8 space-y-5">
                <div className="space-y-1">
                  <p className="eyebrow">Last step</p>
                  <h2 id="h2" className="text-2xl sm:text-3xl font-semibold">
                    Where should we send your results?
                  </h2>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="c-name" className="block font-bold">
                    Your name
                  </label>
                  <input
                    id="c-name"
                    required
                    autoComplete="name"
                    className={input}
                    value={f.name}
                    onChange={(e) => setF({ ...f, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="c-email" className="block font-bold">
                    Email
                  </label>
                  <input
                    id="c-email"
                    required
                    type="email"
                    spellCheck={false}
                    inputMode="email"
                    autoComplete="email"
                    className={input}
                    value={f.email}
                    onChange={(e) => setF({ ...f, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="c-phone" className="block font-bold">
                    Mobile
                  </label>
                  <input
                    id="c-phone"
                    required
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    className={input}
                    value={f.phone}
                    onChange={(e) => setF({ ...f, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="c-size" className="block font-bold">
                    {niche.team}
                  </label>
                  <select
                    id="c-size"
                    required
                    className={input}
                    value={size}
                    onChange={(e) => setSize(e.target.value as Size)}
                  >
                    <option value="" disabled>
                      Choose one
                    </option>
                    {niche.sizes.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset className="space-y-2" aria-describedby="hd-hint">
                  <legend className="font-bold">What are your biggest headaches right now?</legend>
                  <p id="hd-hint" className="text-muted-foreground">
                    Tick all that apply.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {niche.headaches.map(([v, l]) => (
                      <label key={v} className={tick}>
                        <input
                          type="checkbox"
                          name="headaches"
                          value={v}
                          className="h-5 w-5 shrink-0 accent-[var(--navy)]"
                          checked={headaches.includes(v)}
                          onChange={(e) =>
                            setHeadaches((h) =>
                              e.target.checked ? [...h, v] : h.filter((x) => x !== v),
                            )
                          }
                        />
                        <span>{l}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="space-y-2">
                  <legend className="font-bold">Can we send you tips and offers? (optional)</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label htmlFor="c-consent-email" className={tick}>
                      <input
                        id="c-consent-email"
                        type="checkbox"
                        className="h-5 w-5 shrink-0 accent-[var(--navy)]"
                        checked={cEmail}
                        onChange={(e) => setCEmail(e.target.checked)}
                      />
                      <span>
                        Yes, by email
                        <span className="sr-only">: send me tips and offers by email</span>
                      </span>
                    </label>
                    <label htmlFor="c-consent-wa" className={tick}>
                      <input
                        id="c-consent-wa"
                        type="checkbox"
                        className="h-5 w-5 shrink-0 accent-[var(--navy)]"
                        checked={cWa}
                        onChange={(e) => setCWa(e.target.checked)}
                      />
                      <span>
                        Yes, by WhatsApp
                        <span className="sr-only">: send me tips and offers on WhatsApp</span>
                      </span>
                    </label>
                  </div>
                </fieldset>
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  aria-label="Leave this empty"
                  className="hidden"
                  value={f.website}
                  onChange={(e) => setF({ ...f, website: e.target.value })}
                />
                {err && (
                  <p role="alert" className="font-semibold text-destructive">
                    {err}
                  </p>
                )}
                <button type="submit" disabled={busy} className="btn btn-gold btn-lg w-full">
                  {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                  {busy ? "Building your report…" : "Show my score"}
                </button>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <Lock className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    Free. Your results appear straight away. We never share your details. See our{" "}
                    <Link to="/privacy" className="underline underline-offset-2 text-foreground">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </p>
              </form>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-border bg-secondary/60 py-8 text-center text-muted-foreground">
        Accelur8 · Cwmbran, Wales ·{" "}
        <Link
          to="/privacy"
          className="inline-flex min-h-11 items-center underline underline-offset-2"
        >
          Privacy
        </Link>{" "}
        ·{" "}
        <Link
          to="/terms"
          className="inline-flex min-h-11 items-center underline underline-offset-2"
        >
          Terms
        </Link>
      </footer>
    </div>
  );
}
