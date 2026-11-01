import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { forgotPassword } from "../lib/auth.functions";
import { Mail, AlertTriangle, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password | RepSuites" },
      {
        name: "description",
        content: "Request a password reset link for your account.",
      },
      {
        property: "og:title",
        content: "Reset password | RepSuites",
      },
      {
        property: "og:description",
        content: "Request a password reset link for your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fn = useServerFn(forgotPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res: any = await fn({ data: { email } });
      if (!res.ok) {
        setError(res.error || "Could not send reset email. Try again.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Could not send reset email. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-xl shadow-lg p-6 sm:p-8">
        <div className="mb-6 text-center">
          <span className="text-lg font-bold tracking-tight text-foreground">RepSuites</span>
          <p className="mt-1 text-xs text-muted-foreground">by Accelur8</p>
        </div>

        {sent ? (
          <div className="text-center space-y-3">
            <ShieldCheck className="w-12 h-12 mx-auto text-emerald-600" />
            <h1 className="text-lg font-semibold">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              If an account exists for that email, you will receive a link to reset your password.
              The link expires after a short time.
            </p>
            <a
              href="/"
              className="inline-block mt-2 text-sm font-medium text-primary-ink underline"
            >
              Back to sign in
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <Mail className="w-10 h-10 mx-auto text-primary-ink" />
              <h1 className="text-lg font-bold">Reset your password</h1>
              <p className="text-sm text-muted-foreground">
                Enter your email and we will send a link to set a new password.
              </p>
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="fp-email"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Email address
                </label>
                <input
                  id="fp-email"
                  type="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="email"
                  placeholder="e.g. you@yourbusiness.com"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary text-primary-foreground text-sm font-semibold py-2.5 min-h-[44px] disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
            <div className="text-center">
              <a
                href="/"
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 inline-flex items-center min-h-11"
              >
                Back to sign in
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
