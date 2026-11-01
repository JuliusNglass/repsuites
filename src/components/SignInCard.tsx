import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { signIn } from "../lib/auth.functions";
import { Lock, AlertTriangle, ShieldCheck, Key, Settings } from "lucide-react";
import type { HostTenant } from "../lib/tenant-domain";

export function SignInCard({
  isConfigured,
  missingMessage,
  demoAvailable,
  hostTenant,
}: {
  isConfigured: boolean;
  missingMessage?: string;
  demoAvailable?: boolean;
  // Set when the app is opened on a business's own web address.
  hostTenant?: HostTenant | null;
}) {
  const navigate = useNavigate();
  const signInFn = useServerFn(signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBlockedPassword, setIsBlockedPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfigured) return;
    setLoading(true);
    setErrorMessage(null);
    setIsBlockedPassword(false);

    try {
      const res = await signInFn({ data: { email, password } });
      if (res.ok) {
        navigate({ to: "/dashboard" });
        return;
      }
      setErrorMessage(res.error || "Sign in failed");
      if (res.blockedPasswordSetup) setIsBlockedPassword(true);
    } catch (err: any) {
      setErrorMessage("Sign in could not be completed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-6 sm:p-8">
      {/* Header Branding */}
      {hostTenant ? (
        <div className="text-center mb-6">
          {hostTenant.logoUrl ? (
            <img
              src={hostTenant.logoUrl}
              alt={hostTenant.name}
              className="mx-auto mb-2 h-12 max-w-[200px] object-contain"
            />
          ) : (
            <span className="mx-auto mb-2 w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xl font-black">
              {hostTenant.name.trim().charAt(0).toUpperCase() || "S"}
            </span>
          )}
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{hostTenant.name}</h1>
          <p className="text-xs text-muted-foreground mt-1">Sign in to your account</p>
        </div>
      ) : (
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Sign in</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Local visibility for local businesses
          </p>
        </div>
      )}

      {/* Setup Required Banner when secrets are missing */}
      {!isConfigured && (
        <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs leading-relaxed space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200 text-sm">
            <Settings className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            Secrets Setup Required
          </div>
          <p>Real sign-in and data access are disabled until server configuration is reviewed.</p>
          <div className="bg-background/80 p-2.5 rounded font-mono text-[11px] border border-amber-500/20 text-muted-foreground space-y-0.5">
            <div>1. REPSUITES_PUBLISHABLE_KEY</div>
            <div>2. REPSUITES_SESSION_SECRET (≥ 32 bytes)</div>
            <div>3. REPSUITES_APP_ORIGIN</div>
          </div>
          {missingMessage && (
            <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80">{missingMessage}</p>
          )}
        </div>
      )}

      {/* Blocked Setup Message */}
      {isBlockedPassword && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Key className="w-4 h-4 shrink-0" />
            First-Password Change Pending
          </div>
          <p>
            This account requires a first-time password setup. Follow the setup steps to activate
            your account.
          </p>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && !isBlockedPassword && (
        <div className="mb-6 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Sign-In Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Email address</label>
          <input
            type="email"
            required
            disabled={!isConfigured || loading}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. you@yourbusiness.com"
            autoComplete="email"
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Password</label>
          <input
            type="password"
            required
            disabled={!isConfigured || loading}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={!isConfigured || loading}
          className="w-full py-2.5 px-4 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="inline-block animate-spin">⏳</span>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Sign In
            </>
          )}
        </button>

        {isConfigured && (
          <div className="text-center pt-1 space-y-2">
            <a
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 block"
            >
              Forgot password?
            </a>
            {demoAvailable && (
              <a
                href="/demo"
                className="text-xs text-primary-ink hover:text-primary-ink/80 font-medium underline underline-offset-2 block"
              >
                Try the interactive demo →
              </a>
            )}
          </div>
        )}
      </form>

      {/* Security Notices */}
      <div className="mt-6 pt-4 border-t border-border text-[11px] text-muted-foreground space-y-2">
        <div className="flex items-center gap-1.5 text-foreground/80 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          Getting started
        </div>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li>Business owners, their team and agency partners sign in here.</li>
          <li>Change your temporary password at first sign-in to activate access.</li>
        </ul>
      </div>
    </div>
  );
}
