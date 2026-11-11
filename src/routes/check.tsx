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

const input =
  "w-full rounded-xl border border-input bg-background px-4 py-3 min-h-12 text-base focus:outline-none focus:ring-2 focus:ring-primary/40";

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
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Logo />
        </div>
      </header>

      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-8 sm:py-12">
        {!place ? (
          <section aria-labelledby="h1" className="space-y-6">
            <div className="space-y-3">
              <p className="text-base font-semibold text-primary">Free 30-second check</p>
              <h1 id="h1" className="text-3xl sm:text-4xl font-bold leading-tight">
                {niche.headline}
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed">{niche.sub}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3 shadow-sm">
              <label className="block space-y-1">
                <span className="text-base font-semibold">
                  What do customers type into Google to find you?
                </span>
                <input
                  required
                  className={input}
                  value={keyword}
                  maxLength={60}
                  onChange={(e) => setKeyword(e.target.value)}
                  aria-describedby="kw-hint"
                />
                <span id="kw-hint" className="block text-base text-muted-foreground">
                  {niche.keywordHint}
                </span>
              </label>
              <BusinessSearch
                value={business}
                onChange={setBusiness}
                confirmed={place}
                onConfirm={setPlace}
              />
              <p className="text-base text-muted-foreground">
                Type your business name and town, then pick it from the list.
              </p>
            </div>
            <ul className="space-y-2 text-base">
              {[
                "Your score out of 100",
                "Your top gaps, in plain English",
                "How you compare with businesses near you",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="w-5 h-5 mt-0.5 text-emerald-600 shrink-0" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section aria-labelledby="h2" className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-lg">{place.name}</p>
                  <p className="text-base text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-4 h-4" aria-hidden /> {place.town || place.address}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPlace(null)}
                  className="text-base underline min-h-11 px-2 shrink-0"
                >
                  Change
                </button>
              </div>
              {place.rating != null && (
                <p className="text-base flex items-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" aria-hidden />
                  {place.rating} from {place.reviewCount ?? 0} reviews
                </p>
              )}
              <ol className="space-y-1.5 pt-1" aria-live="polite">
                {SCAN_STEPS.map((s, i) => (
                  <li
                    key={s}
                    className={`flex items-center gap-2 text-base ${i > step ? "text-muted-foreground/60" : ""}`}
                  >
                    {i < step ? (
                      <Check className="w-4 h-4 text-emerald-600" aria-hidden />
                    ) : i === step ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden />
                    ) : (
                      <span
                        className="w-4 h-4 rounded-full border border-border inline-block"
                        aria-hidden
                      />
                    )}
                    {s}
                  </li>
                ))}
              </ol>
            </div>

            <form
              onSubmit={submit}
              className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4"
            >
              <h2 id="h2" className="text-xl font-bold">
                Where should we send your results?
              </h2>
              <label className="block space-y-1">
                <span className="text-base font-semibold">Your name</span>
                <input
                  required
                  autoComplete="name"
                  className={input}
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-base font-semibold">Email</span>
                <input
                  required
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className={input}
                  value={f.email}
                  onChange={(e) => setF({ ...f, email: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-base font-semibold">Mobile</span>
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className={input}
                  value={f.phone}
                  onChange={(e) => setF({ ...f, phone: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-base font-semibold">{niche.team}</span>
                <select
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
              </label>
              <fieldset className="space-y-1">
                <legend className="text-base font-semibold">
                  What are your biggest headaches right now?
                </legend>
                <p className="text-base text-muted-foreground">Tick all that apply.</p>
                {niche.headaches.map(([v, l]) => (
                  <label key={v} className="flex items-center gap-3 min-h-11 text-base">
                    <input
                      type="checkbox"
                      className="w-5 h-5"
                      checked={headaches.includes(v)}
                      onChange={(e) =>
                        setHeadaches((h) =>
                          e.target.checked ? [...h, v] : h.filter((x) => x !== v),
                        )
                      }
                    />
                    {l}
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-base font-semibold">
                  Can we send you tips and offers? (optional)
                </legend>
                <label className="flex items-center gap-3 min-h-11 text-base">
                  <input
                    type="checkbox"
                    className="w-5 h-5"
                    checked={cEmail}
                    onChange={(e) => setCEmail(e.target.checked)}
                  />
                  Yes, by email
                </label>
                <label className="flex items-center gap-3 min-h-11 text-base">
                  <input
                    type="checkbox"
                    className="w-5 h-5"
                    checked={cWa}
                    onChange={(e) => setCWa(e.target.checked)}
                  />
                  Yes, by WhatsApp
                </label>
              </fieldset>
              <input
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
                value={f.website}
                onChange={(e) => setF({ ...f, website: e.target.value })}
              />
              {err && (
                <p role="alert" className="text-base font-semibold text-destructive">
                  {err}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-primary text-primary-foreground font-bold text-lg py-4 min-h-12 inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy && <Loader2 className="w-5 h-5 animate-spin" aria-hidden />}
                {busy ? "Building your report" : "Show my score"}
              </button>
              <p className="text-base text-muted-foreground flex items-start gap-2">
                <Lock className="w-4 h-4 mt-1 shrink-0" aria-hidden />
                <span>
                  Free. Your results appear straight away. We never share your details. See our{" "}
                  <Link to="/privacy" className="underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </p>
            </form>
          </section>
        )}
      </main>

      <footer className="border-t border-border py-6 text-center text-base text-muted-foreground">
        Accelur8 · Cwmbran, Wales ·{" "}
        <Link to="/privacy" className="underline">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link to="/terms" className="underline">
          Terms
        </Link>
      </footer>
    </div>
  );
}
