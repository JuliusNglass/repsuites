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
import { signupProblemAt, type SignupField } from "../lib/signup";

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

const field = "field text-base";

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
  // A problem with one field is shown next to that field, not only at the end.
  const [fieldError, setFieldError] = useState<{ field: SignupField; message: string } | null>(
    null,
  );

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
  const errFor = (f: SignupField) => (fieldError?.field === f ? fieldError.message : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { business: businessName, name, email, password, agree };
    const problem = signupProblemAt(input);
    setError(null);
    setFieldError(problem);
    if (problem) {
      document.getElementById(`s-${problem.field}`)?.focus();
      return;
    }
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
      <section
        aria-labelledby="start-h1"
        className="px-4 py-6 md:py-20 bg-[radial-gradient(90%_60%_at_0%_0%,var(--gold-soft),transparent_65%)]"
      >
        <div className="max-w-6xl mx-auto grid md:grid-cols-[1fr_1.1fr] gap-10 lg:gap-14 items-start">
          <div className="order-2 md:order-1 md:pt-6">
            <p className="eyebrow">
              <span className="h-px w-6 bg-primary-ink" aria-hidden /> Free for ever
            </p>
            <h1 id="start-h1" className="mt-3 text-4xl sm:text-5xl font-semibold leading-[1.08]">
              Get more Google reviews,{" "}
              <span className="italic text-primary-ink">starting today</span>
            </h1>
            <p className="mt-4 text-lg sm:text-xl text-muted-foreground">
              Set up in 2 minutes. No card needed.
            </p>
            <ul className="mt-8 grid gap-3">
              {PERKS.map((p) => (
                <li key={p} className="card flex gap-4 items-center p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-primary/40">
                    <Check className="h-5 w-5 text-primary-ink" aria-hidden />
                  </span>
                  <span className="text-base">{p}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 rounded-2xl border border-border bg-secondary/60 p-5 text-base text-muted-foreground">
              Want more later? RepSuites Growth writes your review replies, asks customers for
              reviews and gets you higher on Google Maps.{" "}
              <Link
                to="/pricing"
                className="font-semibold text-foreground underline underline-offset-2"
              >
                See prices
              </Link>
            </p>
          </div>

          <form
            onSubmit={submit}
            className="order-1 md:order-2 card rounded-3xl p-5 sm:p-8 shadow-[var(--shadow-lift)] space-y-5"
          >
            <h2 className="text-2xl sm:text-3xl font-semibold">Create your free account</h2>
            <p className="-mt-2 text-base text-muted-foreground">
              Then print your review QR card. Free, no card needed.
            </p>
            <div id={fromReport ? undefined : "s-business"} tabIndex={fromReport ? undefined : -1}>
              {fromReport ? (
                <label className="text-base font-bold block mb-1.5" htmlFor="s-business">
                  Your business
                </label>
              ) : null}
              {fromReport ? (
                <input
                  id="s-business"
                  aria-invalid={errFor("business") ? true : undefined}
                  aria-describedby={errFor("business") ? "s-business-err" : undefined}
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
              <FieldError id="s-business-err" message={errFor("business")} />
            </div>
            <div>
              <label className="text-base font-bold block mb-1.5" htmlFor="s-name">
                Your name
              </label>
              <input
                id="s-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={field}
                autoComplete="name"
                aria-invalid={errFor("name") ? true : undefined}
                aria-describedby={errFor("name") ? "s-name-err" : undefined}
              />
              <FieldError id="s-name-err" message={errFor("name")} />
            </div>
            <div>
              <label className="text-base font-bold block mb-1.5" htmlFor="s-email">
                Email
              </label>
              <input
                id="s-email"
                type="email"
                spellCheck={false}
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={field}
                autoComplete="email"
                aria-invalid={errFor("email") ? true : undefined}
                aria-describedby={errFor("email") ? "s-email-err" : undefined}
              />
              <FieldError id="s-email-err" message={errFor("email")} />
            </div>
            <div>
              <label className="text-base font-bold block mb-1.5" htmlFor="s-pass">
                Choose a password
              </label>
              <input
                id="s-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={field}
                autoComplete="new-password"
                aria-describedby={errFor("password") ? "s-pass-hint s-pass-err" : "s-pass-hint"}
                aria-invalid={errFor("password") ? true : undefined}
              />
              <p id="s-pass-hint" className="mt-1.5 text-base text-muted-foreground">
                At least 10 characters
              </p>
              <FieldError id="s-pass-err" message={errFor("password")} />
            </div>
            <input
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="off"
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
              aria-label="Leave this empty"
              className="hidden"
              name="website"
            />
            <label
              htmlFor="s-agree"
              className="flex gap-3 items-start rounded-xl border border-border bg-background px-4 py-3 min-h-12 text-base has-[:checked]:bg-gold-soft has-[:checked]:border-navy/60"
            >
              <input
                id="s-agree"
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 w-6 h-6 shrink-0 accent-[var(--navy)]"
                aria-invalid={errFor("agree") ? true : undefined}
                aria-describedby={errFor("agree") ? "s-agree-err" : undefined}
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
            <FieldError id="s-agree-err" message={errFor("agree")} />
            {error && (
              <p className="text-base text-destructive" role="alert">
                {error}{" "}
                {error.includes("Sign in") && (
                  <Link to="/login" className="underline font-semibold">
                    Sign in here
                  </Link>
                )}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn btn-gold btn-lg w-full">
              {busy && <Loader2 className="w-5 h-5 animate-spin" aria-hidden />}
              {busy ? "Setting up your account…" : "Start free"}
            </button>
            <p className="text-base text-center text-muted-foreground">
              No card needed. Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-foreground underline underline-offset-2"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </section>
    </PublicLayout>
  );
}

// A problem shown right under its field and read out by screen readers.
function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-base font-semibold text-destructive">
      {message}
    </p>
  );
}
