// Free sign-up. Arrives from a prospect report (?r=<token>), the pricing
// page or the home page. No em dashes in this copy (AGENTS.md).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Check, Loader2 } from "lucide-react";
import { PublicLayout } from "../components/site/PublicLayout";
import { BusinessSearch } from "../components/site/BusinessSearch";
import type { BusinessDetails } from "../lib/places.functions";
import { getSignupPrefill, signUpFreeFn } from "../lib/signup.functions";
import { signupProblem } from "../lib/signup";

export const Route = createFileRoute("/start")({
  validateSearch: z.object({ r: z.string().max(64).optional() }),
  head: () => ({
    meta: [
      { title: "Start free | RepSuites" },
      {
        name: "description",
        content:
          "Get your free review page and QR code. Turn happy customers into Google reviews. No card needed.",
      },
    ],
  }),
  component: Start,
});

const field =
  "w-full rounded-xl border border-input bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/40";

const PERKS = [
  "Your own review page and QR code",
  "Unhappy customers message you, not Google",
  "See how many people call you from Google",
];

function Start() {
  const { r } = Route.useSearch();
  const prefill = useServerFn(getSignupPrefill);
  const signUp = useServerFn(signUpFreeFn);
  const [business, setBusiness] = useState("");
  const [biz, setBiz] = useState<BusinessDetails | null>(null);
  const [fromReport, setFromReport] = useState<{
    business: string;
    placeId: string;
    name: string;
  } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!r) return;
    prefill({ data: { r } })
      .then((p) => {
        if (p) {
          setFromReport(p);
          setBusiness(p.business);
          if (p.name) setName((cur) => cur || p.name);
        }
      })
      .catch(() => null);
  }, [r, prefill]);

  const businessName = fromReport ? business : (biz?.name ?? business);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { business: businessName, name, email, password, agree };
    const problem = signupProblem(input);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      const res = await signUp({
        data: {
          ...input,
          ...(fromReport && r ? { report: r } : {}),
          ...(!fromReport && biz ? { placeId: biz.placeId } : {}),
          ...(trap ? { website: trap } : {}),
        },
      });
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      window.location.href = res.signedIn ? "/dashboard?welcome=1" : "/login";
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <PublicLayout>
      <section className="px-4 py-6 md:py-16">
        <div className="max-w-5xl mx-auto grid md:grid-cols-[1fr_1.1fr] gap-10 items-start">
          <div className="order-2 md:order-1 md:pt-6">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">
              Free for ever
            </p>
            <h1 className="mt-2 text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
              Get more Google reviews, starting today
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Set up in 2 minutes. No card needed.
            </p>
            <ul className="mt-6 space-y-3">
              {PERKS.map((p) => (
                <li key={p} className="flex gap-3 items-start">
                  <span className="mt-0.5 rounded-full bg-emerald-600 text-white p-1">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-base">{p}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-muted-foreground">
              Want more later? RepSuites Growth writes your review replies, asks customers for
              reviews and gets you higher on Google Maps.{" "}
              <Link to="/pricing" className="underline underline-offset-2">
                See prices
              </Link>
            </p>
          </div>

          <form
            onSubmit={submit}
            className="order-1 md:order-2 rounded-3xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-4"
          >
            <h2 className="text-xl font-bold">Create your free account</h2>
            <p className="-mt-2 text-sm text-muted-foreground">
              Then print your review QR card. Free, no card needed.
            </p>
            <div>
              <label className="text-sm font-semibold block mb-1.5">Your business</label>
              {fromReport ? (
                <input
                  value={business}
                  onChange={(e) => setBusiness(e.target.value)}
                  className={field}
                  autoComplete="organization"
                />
              ) : (
                <BusinessSearch
                  value={business}
                  onChange={setBusiness}
                  confirmed={biz}
                  onConfirm={setBiz}
                />
              )}
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1.5" htmlFor="s-name">
                Your name
              </label>
              <input
                id="s-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={field}
                autoComplete="name"
              />
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1.5" htmlFor="s-email">
                Email
              </label>
              <input
                id="s-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={field}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1.5" htmlFor="s-pass">
                Choose a password
              </label>
              <input
                id="s-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={field}
                autoComplete="new-password"
                aria-describedby="s-pass-hint"
              />
              <p id="s-pass-hint" className="mt-1.5 text-sm text-muted-foreground">
                At least 10 characters
              </p>
            </div>
            <input
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="off"
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
              className="hidden"
              name="website"
            />
            <label className="flex gap-2.5 items-start text-sm">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-1 w-4 h-4"
              />
              <span>
                I agree to the{" "}
                <Link to="/terms" className="underline">
                  terms
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="underline">
                  privacy policy
                </Link>
                .
              </span>
            </label>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}{" "}
                {error.includes("Sign in") && (
                  <Link to="/login" className="underline font-semibold">
                    Sign in here
                  </Link>
                )}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-primary text-primary-foreground font-bold py-4 text-lg flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy && <Loader2 className="w-5 h-5 animate-spin" />}
              {busy ? "Setting up your account" : "Start free"}
            </button>
            <p className="text-xs text-center text-muted-foreground">
              No card needed. Already have an account?{" "}
              <Link to="/login" className="underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </section>
    </PublicLayout>
  );
}
