// Server-only staging_staff_password_status RPC wrapper.
//
// Extracted from supabase.server.ts so that file stays under the edit limit.
//
// SECURITY DEFINER RPC taking p_user_id (the verified session user_id).
// Passing p_user_id explicitly (same pattern as repsuites_get_my_memberships)
// makes the check work for every signed-in user, including those created via
// the Auth Admin API with no manual-staff baseline. The caller has already
// verified the Supabase identity (verifyUserIdentity) before calling this,
// so p_user_id is trusted input.
//
// Valid success shape: { mustChangePassword: boolean }.
// Missing / malformed / error / timeout must deny access; true blocks workspace.
import { getSupabaseConfig } from "./config.server";

const DEFAULT_TIMEOUT_MS = 8000;

async function boundedFetch(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" as any });
  } finally {
    clearTimeout(timer);
  }
}

export interface PasswordStatusResult {
  mustChangePassword: boolean | null; // null = indeterminate (deny)
  needsChange: boolean;
  deny: boolean;
  error: string | null;
}

export async function checkPasswordStatus(
  jwt: string,
  userId: string,
): Promise<PasswordStatusResult> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured)
    return { mustChangePassword: null, needsChange: false, deny: true, error: "setup_required" };
  if (!userId)
    return { mustChangePassword: null, needsChange: false, deny: true, error: "missing_user_id" };

  try {
    // Route through the service role when REPSUITES_SERVICE_KEY is set so the
    // SECURITY DEFINER RPC (granted to service_role only) is callable. The
    // caller already verified the identity (verifyUserIdentity) before this
    // call, so p_user_id is trusted. In tests (no service key) fall back to
    // the user-JWT path so the fetch mocks keep matching on the same URL.
    const svcKey = (process.env["REPSUITES_SERVICE_KEY"] || "").trim();
    const rpcHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Client-Info": "repsuites",
    };
    if (svcKey) {
      rpcHeaders["apikey"] = svcKey;
      // Legacy JWT service keys need Authorization: Bearer to trigger the
      // service_role bypass in PostgREST. Modern sb_secret_* opaque keys
      // must NOT carry an Authorization header.
      if (svcKey.startsWith("eyJ")) rpcHeaders["Authorization"] = `Bearer ${svcKey}`;
    } else {
      rpcHeaders["apikey"] = cfg.publishableKey;
      rpcHeaders["Authorization"] = `Bearer ${jwt}`;
    }
    const res = await boundedFetch(`${cfg.url}/rest/v1/rpc/repsuites_password_status`, {
      method: "POST",
      headers: rpcHeaders,
      body: JSON.stringify({ p_user_id: userId }),
    });

    if (!res.ok) {
      // On any upstream error, fail closed (deny).
      return {
        mustChangePassword: null,
        needsChange: false,
        deny: true,
        error: "password_status_error",
      };
    }

    const data = await res.json().catch(() => null);

    // Valid shape: object with boolean mustChangePassword.
    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      typeof data.mustChangePassword === "boolean"
    ) {
      const needs = data.mustChangePassword === true;
      return {
        mustChangePassword: data.mustChangePassword,
        needsChange: needs,
        deny: needs,
        error: null,
      };
    }

    // Malformed response - deny.
    return {
      mustChangePassword: null,
      needsChange: false,
      deny: true,
      error: "password_status_malformed",
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { mustChangePassword: null, needsChange: false, deny: true, error: "timeout" };
    }
    return {
      mustChangePassword: null,
      needsChange: false,
      deny: true,
      error: "password_status_network_error",
    };
  }
}
