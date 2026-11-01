import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { resetPassword, verifyRecoveryToken } from "../lib/auth.functions";
import { KeyRound, AlertTriangle, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password | RepSuites" },
      {
        name: "description",
        content: "Reset your account password.",
      },
      {
        property: "og:title",
        content: "Reset password | RepSuites",
      },
      {
        property: "og:description",
        content: "Reset your account password.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

// Parse the recovery token from the URL hash. GoTrue redirects to
// /reset-password#access_token=...&type=recovery&refresh_token=...
// The token is transient - read from the hash, never stored.
function parseRecoveryHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const type = params.get("type");
  if (accessToken && (type === "recovery" || type === "password_recovery")) {
    return accessToken;
  }
  return null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-xl shadow-lg p-6 sm:p-8">
        <div className="mb-6 text-center">
          <span className="text-lg font-bold tracking-tight text-foreground">RepSuites</span>
          <p className="mt-1 text-xs text-muted-foreground">by Accelur8</p>
        </div>
        {children}
      </div>
    </main>
  );
}

function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const resetFn = useServerFn(resetPassword);
  const checkFn = useServerFn(verifyRecoveryToken);

  useEffect(() => {
    const t = parseRecoveryHash();
    if (!t) {
      setChecking(false);
      setExpired(true);
      return;
    }
    setToken(t);
    // Verify the recovery token server-side before showing the form.
    checkFn({ data: { accessToken: t } })
      .then((res: any) => {
        if (!res.ok) {
          setExpired(true);
        }
        setChecking(false);
      })
      .catch(() => {
        setExpired(true);
        setChecking(false);
      });
  }, []);

  const clearPasswords = () => {
    setPassword("");
    setConfirm("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || uncertain || !token) return;
    if (password.length < 12 || password.length > 256) {
      setError("Password must be 12-256 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match - check and try again.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res: any = await resetFn({
        data: { accessToken: token, newPassword: password, confirm },
      });
      // Always clear passwords after every attempt - never echo or retain.
      clearPasswords();
      if (!res.ok) {
        if (res.uncertain) {
          setUncertain(true);
          setError(
            "We could not confirm whether your password was changed. Try signing in, or request a new reset link.",
          );
        } else {
          setError(res.error || "Could not update your password.");
        }
      } else {
        // Consume the token - clear the hash so it cannot be replayed.
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }
        setDone(true);
      }
    } catch {
      clearPasswords();
      setUncertain(true);
      setError(
        "We could not confirm whether your password was changed. Try signing in, or request a new reset link.",
      );
    }
    setSaving(false);
  };

  if (checking) {
    return (
      <Shell>
        <p className="text-center text-sm text-muted-foreground">Checking your link...</p>
      </Shell>
    );
  }

  if (expired) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              This link has expired. Return to sign in and request a new password reset link.
            </span>
          </div>
          <a
            href="/"
            className="block w-full rounded-lg bg-primary text-primary-foreground text-sm font-semibold py-2.5 text-center min-h-[44px]"
          >
            Back to sign in
          </a>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <ShieldCheck className="w-12 h-12 mx-auto text-emerald-600" />
          <h1 className="text-lg font-semibold">Password updated</h1>
          <p className="text-sm text-muted-foreground">
            Your password has been changed. Sign in with your new password.
          </p>
          <a href="/" className="inline-block mt-2 text-sm font-medium text-primary-ink underline">
            Go to sign in
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <KeyRound className="w-10 h-10 mx-auto text-primary-ink" />
          <h1 className="text-lg font-bold">Set a new password</h1>
          <p className="text-xs text-muted-foreground">
            Choose a password (12-256 characters) to replace your current one.
          </p>
        </div>
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {uncertain ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs p-3 space-y-2">
              <p>
                We could not confirm whether your password was changed. Do not submit again yet.
              </p>
              <p>
                Try signing in with your new password. If that does not work, request a new reset
                link from the sign-in page.
              </p>
            </div>
            <a
              href="/"
              className="block w-full rounded-lg border border-input py-2.5 text-sm font-medium text-center min-h-[44px]"
            >
              Back to sign in
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">New password</label>
              <input
                type="password"
                required
                minLength={12}
                placeholder="At least 12 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
                autoComplete="new-password"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Confirm password
              </label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={saving}
                autoComplete="new-password"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-primary text-primary-foreground text-sm font-semibold py-2.5 min-h-[44px] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </Shell>
  );
}
