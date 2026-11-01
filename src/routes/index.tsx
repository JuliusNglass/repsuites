// RepSuites public homepage. Framed around what a local business owner wants:
// more people finding them, trusting them and choosing them.
// No em dashes in this copy (AGENTS.md).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  MapPin,
  Star,
  Sparkles,
  BarChart3,
  MessageSquareReply,
  Megaphone,
  Inbox,
  QrCode,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { PublicLayout } from "../components/site/PublicLayout";
import { requestVisibilityCheck } from "../lib/leads.functions";
import { BusinessSearch } from "../components/site/BusinessSearch";
import type { BusinessDetails } from "../lib/places.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RepSuites: more local customers finding and choosing you" },
      {
        name: "description",
        content:
          "RepSuites helps local businesses show up on Google Maps and in AI search, win more 5-star reviews and turn searches into customers.",
      },
    ],
  }),
  component: Home,
});

const outcomes = [
  {
    icon: MapPin,
    title: "Get found",
    text: "Show up when people nearby search for what you do on Google Maps. We check where you appear across your area every week and fix what holds you back.",
  },
  {
    icon: Star,
    title: "Get chosen",
    text: "People pick the business with more recent, better reviews. We make asking easy with QR cards, texts and a 10-second review page, and help you reply to every review.",
  },
  {
    icon: Sparkles,
    title: "Get recommended by AI",
    text: "More people now ask ChatGPT, Gemini and other assistants who to use. We check every month whether they name you, and work on the things that make them more likely to.",
  },
];

const steps = [
  {
    title: "Free visibility check",
    text: "Tell us your business and town. We look at how you show up on Google and in AI answers compared with the businesses you lose customers to.",
  },
  {
    title: "Connect your Google profile",
    text: "With your permission, RepSuites reads your reviews and profile so we can reply, post updates and track results in one place.",
  },
  {
    title: "A clear report every month",
    text: "Where you rank, how many people called or asked for directions, new reviews, and whether AI assistants recommend you. Plain English, no jargon.",
  },
];

const googleFeatures = [
  {
    icon: Inbox,
    title: "Every review in one inbox",
    text: "See your Google reviews as they arrive, with the star rating and the customer's words.",
  },
  {
    icon: MessageSquareReply,
    title: "Reply in seconds",
    text: "Write a reply, or start from a suggested draft you can edit. Nothing is posted unless you send it or switch on auto-replies.",
  },
  {
    icon: Megaphone,
    title: "Keep your profile fresh",
    text: "Publish Google posts with offers and news, and update your business description, without logging in to Google.",
  },
  {
    icon: BarChart3,
    title: "See what it brings in",
    text: "Calls, website clicks and direction requests from your Google profile, month by month.",
  },
];

function Home() {
  return (
    <PublicLayout>
      <section className="px-4 pt-16 pb-14 md:pt-24 md:pb-20 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-base font-bold text-muted-foreground mb-4">For local businesses</p>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.08]">
            More local customers{" "}
            <span className="text-primary-ink">finding you and choosing you.</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            When someone nearby needs what you do, they search Google or ask an AI assistant, look
            at the reviews and pick one. RepSuites makes sure that one is you.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/start"
              className="rounded-xl bg-primary text-primary-foreground font-bold px-6 py-3 text-base"
            >
              Start free
            </a>
            <a
              href="#check"
              className="rounded-xl border border-border px-6 py-3 text-base font-semibold"
            >
              Get a free visibility check
            </a>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Free review page and QR code in 2 minutes. No card needed.
          </p>
        </div>
      </section>

      <section className="px-4 py-14 bg-muted/40">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">
            Three things that bring in customers
          </h2>
          <p className="text-center text-muted-foreground mb-10 max-w-2xl mx-auto">
            Being good at what you do is not enough if people cannot find you, or find a competitor
            with better reviews first.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {outcomes.map((o) => (
              <div key={o.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center mb-4">
                  <o.icon className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="text-lg font-bold mb-2">{o.title}</h3>
                <p className="text-muted-foreground">{o.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="px-4 py-14">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-10">How it works</h2>
          <ol className="grid md:grid-cols-3 gap-5">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-border p-6">
                <span className="inline-flex w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold items-center justify-center mb-3">
                  {i + 1}
                </span>
                <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                <p className="text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="google-business-profile" className="px-4 py-14 bg-muted/40">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">
            Connect your Google Business Profile
          </h2>
          <p className="text-center text-muted-foreground mb-10">
            Run your Google reviews and profile from one place, with your permission.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {googleFeatures.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
                <f.icon className="w-6 h-6 mb-3" />
                <h3 className="font-bold mb-2">{f.title}</h3>
                <p className="text-base text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-base text-muted-foreground mt-8 max-w-2xl mx-auto">
            You connect with your own Google account and can disconnect at any time. Read how we
            handle Google data in our{" "}
            <Link to="/privacy" className="underline underline-offset-2 text-foreground">
              Privacy Policy
            </Link>
            , or see{" "}
            <Link
              to="/google-business-profile"
              className="underline underline-offset-2 text-foreground"
            >
              how the Google connection works
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="px-4 py-14">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-3">Reviews on the counter, not just online</h2>
            <p className="text-muted-foreground mb-4">
              Tap-and-scan review cards and table stands send happy customers straight to your
              Google review page. One scan, one tap, done. Already have RepSuites cards? They keep
              working.
            </p>
            <Link
              to="/cards"
              className="inline-flex items-center min-h-11 font-semibold underline underline-offset-2"
            >
              About review cards
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-card p-8 flex items-center gap-4">
            <QrCode className="w-16 h-16 shrink-0" />
            <p className="text-muted-foreground">
              Customers scan, rate you and land on Google ready to post. You see every scan in your
              monthly report.
            </p>
          </div>
        </div>
      </section>

      <section id="check" className="px-4 py-16 bg-muted/40">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-2">Get your free visibility check</h2>
          <p className="text-center text-muted-foreground mb-8">
            See where you show up on Google Maps across your area, how your reviews compare, and
            whether AI assistants mention you. We send it within 2 working days.
          </p>
          <CheckForm />
        </div>
      </section>
    </PublicLayout>
  );
}

function CheckForm() {
  const send = useServerFn(requestVisibilityCheck);
  const [f, setF] = useState({
    name: "",
    business: "",
    town: "",
    email: "",
    phone: "",
    website: "",
  });
  const [place, setPlace] = useState<BusinessDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Phones fill these in for the visitor and show the right keyboard.
  const AUTO: Partial<Record<keyof typeof f, string>> = {
    name: "name",
    town: "address-level2",
    email: "email",
    phone: "tel",
  };
  const field = (k: keyof typeof f, label: string, type = "text", required = true) => (
    <label className="block space-y-1">
      <span className="text-base font-semibold">{label}</span>
      <input
        type={type}
        name={k}
        required={required}
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        autoComplete={AUTO[k]}
        inputMode={type === "email" ? "email" : type === "tel" ? "tel" : undefined}
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 min-h-11 text-base"
      />
    </label>
  );
  if (done)
    return (
      <div role="status" className="rounded-2xl border border-border bg-card p-6 text-center">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
        <p className="font-semibold">Thanks, we have your details.</p>
        <p className="text-base text-muted-foreground">
          Your visibility check will arrive by email within 2 working days.
        </p>
      </div>
    );
  return (
    <form
      className="rounded-2xl border border-border bg-card p-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const r = await send({
            data: {
              ...f,
              place: place
                ? {
                    placeId: place.placeId,
                    address: place.address,
                    rating: place.rating,
                    reviewCount: place.reviewCount,
                    websiteUrl: place.website,
                    mapsUrl: place.mapsUrl,
                  }
                : null,
            },
          });
          if (r.ok) setDone(true);
          else setErr(r.error);
        } catch {
          setErr("Please check the details and try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {field("name", "Your name")}
      <BusinessSearch
        value={f.business}
        onChange={(v) => setF((cur) => ({ ...cur, business: v }))}
        confirmed={place}
        onConfirm={(b) => {
          setPlace(b);
          if (b)
            setF((cur) => ({
              ...cur,
              business: b.name || cur.business,
              town: cur.town || b.town,
              phone: cur.phone || b.phone,
            }));
        }}
      />
      {field("town", "Town or city")}
      {field("email", "Email", "email")}
      {field("phone", "Phone (optional)", "tel", false)}
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
        className="w-full rounded-xl bg-primary text-primary-foreground font-bold py-3 inline-flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Send me my free check
      </button>
      <p className="text-sm text-muted-foreground text-center">
        We use your details only to send your check and follow up about it. See our{" "}
        <Link to="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
