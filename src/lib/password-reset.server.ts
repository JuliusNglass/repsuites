// Server-only password reset helpers for RepSuites.
// Uses the same raw GoTrue REST API, publishable key, exact Origin guard,
// bounded fetch timeout, no-store, and sanitized errors as the rest of
// the auth layer. No browser Supabase client, no tokens in localStorage.
import { setResponseStatus, getRequestHeader } from "@tanstack/react-start/server";
import { getSupabaseConfig, describeMissingConfig } from "./config.server";
import { verifyRequestOriginAsync, applyNoStoreHeaders } from "./auth.server";

export interface ResetEmailResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface ResetPasswordResult {
  ok: boolean;
  status?: number;
  uncertain?: boolean;
  error?: string;
}

export interface RecoveryCheckResult {
  ok: boolean;
  error?: string;
}

// Bounded fetch - 8 second timeout, no-store, no credentials in URL.
async function boundedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

// Send a password reset email via GoTrue /auth/v1/recover.
// Always returns ok to prevent email enumeration - never reveal whether
// the email address exists.
export async function sendResetEmail(email: string): Promise<ResetEmailResult> {
  applyNoStoreHeaders();
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    return { ok: false, status: 503, error: describeMissingConfig(cfg.missing) };
  }
  if (!(await verifyRequestOriginAsync())) {
    setResponseStatus(403);
    return { ok: false, status: 403, error: "Invalid request origin." };
  }

  const trimmed = (email ?? "").trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, status: 400, error: "Enter a valid email address." };
  }

  try {
    await boundedFetch(`${cfg.url}/auth/v1/recover`, {
      method: "POST",
      headers: {
        apikey: cfg.publishableKey,
        "Content-Type": "application/json",
        "X-Client-Info": "repsuites",
      },
      body: JSON.stringify({
        email: trimmed,
        // Send the reset link back to the web address the request came from
        // (already verified as trusted above), so a business's own domain
        // keeps its branding. Supabase Auth must list it as a redirect URL.
        redirect_to: `${getRequestHeader("origin") || cfg.appOrigin}/reset-password`,
      }),
    });
    // Always return ok - never reveal whether the email exists.
    return { ok: true };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false, status: 504, error: "Request timed out. Try again." };
    }
    return { ok: false, status: 500, error: "Could not send reset email. Try again." };
  }
}

// Verify a recovery access token by calling GoTrue GET /auth/v1/user.
// Read-only check - confirms the token is valid before showing the form.
export async function checkRecoveryToken(accessToken: string): Promise<RecoveryCheckResult> {
  applyNoStoreHeaders();
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    return { ok: false, error: "Setup is not complete." };
  }

  if (typeof accessToken !== "string" || !accessToken.trim()) {
    return { ok: false, error: "Your reset link may have expired. Request a new one." };
  }

  try {
    const res = await boundedFetch(`${cfg.url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: cfg.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "X-Client-Info": "repsuites",
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: "Your reset link has expired. Request a new one from the sign-in page.",
      };
    }
    const data: unknown = await res.json().catch(() => null);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "Your reset link is invalid. Request a new one." };
    }
    const user = data as Record<string, unknown>;
    if (typeof user["id"] !== "string" || !user["id"]) {
      return { ok: false, error: "Your reset link is invalid. Request a new one." };
    }
    return { ok: true };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false, error: "Request timed out. Try the link again." };
    }
    return { ok: false, error: "Could not verify your reset link. Try again." };
  }
}

// Update the user's password using a recovery access token from the URL
// hash (PASSWORD_RECOVERY flow). The token is transient - never stored in
// localStorage, sessionStorage, or a cookie. Exact Origin guard prevents
// cross-origin password changes.
export async function resetPasswordWithToken(
  accessToken: string,
  newPassword: string,
  confirm: string,
): Promise<ResetPasswordResult> {
  applyNoStoreHeaders();
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    return { ok: false, status: 503, error: describeMissingConfig(cfg.missing) };
  }
  if (!(await verifyRequestOriginAsync())) {
    setResponseStatus(403);
    return { ok: false, status: 403, error: "Invalid request origin." };
  }

  if (typeof accessToken !== "string" || !accessToken.trim()) {
    return {
      ok: false,
      status: 400,
      error: "Your reset link may have expired. Request a new one.",
    };
  }
  if (typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 256) {
    return { ok: false, status: 400, error: "Password must be 12-256 characters." };
  }
  if (typeof confirm !== "string" || confirm !== newPassword) {
    return { ok: false, status: 400, error: "Passwords do not match." };
  }

  try {
    const res = await boundedFetch(`${cfg.url}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: cfg.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Client-Info": "repsuites",
      },
      body: JSON.stringify({ password: newPassword }),
    });

    const data: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      if (res.status >= 500) {
        return {
          ok: false,
          status: 502,
          uncertain: true,
          error:
            "We could not confirm whether your password was changed. Try the link again or request a new one.",
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: res.status,
          error: "Your reset link has expired. Request a new one from the sign-in page.",
        };
      }
      return {
        ok: false,
        status: res.status,
        error: "Your password could not be changed. Try again or request a new reset link.",
      };
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return {
        ok: false,
        status: 502,
        uncertain: true,
        error:
          "We could not confirm whether your password was changed. Try signing in with your new password.",
      };
    }
    const user = data as Record<string, unknown>;
    if (typeof user["id"] !== "string" || !user["id"]) {
      return {
        ok: false,
        status: 502,
        uncertain: true,
        error: "We could not confirm whether your password was changed.",
      };
    }

    return { ok: true, status: 200 };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return {
        ok: false,
        status: 504,
        uncertain: true,
        error: "We could not confirm whether your password was changed. Try the link again.",
      };
    }
    return {
      ok: false,
      status: 502,
      uncertain: true,
      error: "We could not confirm whether your password was changed. Try again.",
    };
  }
}
