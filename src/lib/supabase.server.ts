// Server-only Supabase REST client using the user JWT (no service role).
// Talks only to the fixed staging project and only with the publishable key.
import { getSupabaseConfig } from "./config.server";

export const SUPABASE_URL = "https://ljosiwovyixvvxokyuel.supabase.co";

// A JSON value that round-trips through the server-function RPC boundary.
// `unknown` is not serializable there, so result types use this closed type.
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// ---- Verified staging schema (do not guess additional fields) ----

export interface Tenant {
  id: string;
  name: string;
  slug: string;
}

export interface TenantMembership {
  tenant_id: string;
  user_id: string;
  role: string;
  active: boolean;
  can_clean: boolean;
}

export interface TenantSettings {
  tenant_id: string;
  timezone: string;
  currency: string;
  date_format: string;
}

export type AuthenticatedUser = {
  id: string;
  email: string;
  email_confirmed: boolean;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number; // access-token expiry (seconds since epoch)
};

// ------------------------------------------------------------------

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

function buildHeaders(cfg: ReturnType<typeof getSupabaseConfig>, jwt?: string) {
  const headers: Record<string, string> = {
    apikey: cfg.publishableKey,
    "Content-Type": "application/json",
    "X-Client-Info": "repsuites",
  };
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
  return headers;
}

// Generic REST request; only used internally with the publishable key + user JWT.
// On a non-ok response, returns a sanitised `upstream_${status}` error and, for
// 400/422, an optional `businessHint` parsed from the PostgREST error body so
// callers can map known business errors to actionable messages. The raw body is
// never returned verbatim.
export async function supabaseRest<T>(
  endpoint: string,
  options: { method?: string; jwt?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{
  data: T | null;
  error: string | null;
  status: number;
  businessHint?: string | undefined;
}> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    return {
      data: null,
      error: "Configuration required",
      status: 500,
    };
  }

  const url = `${cfg.url}/rest/v1/${endpoint}`;
  const headers = buildHeaders(cfg, options.jwt);
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      headers[k] = v;
    }
  }

  try {
    const res = await boundedFetch(url, {
      method: options.method || "GET",
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });

    if (res.status === 204) return { data: null, error: null, status: 204 };

    const text = await res.text();
    if (!res.ok) {
      // Sanitised error - never leak upstream body verbatim. For 400/422,
      // extract a known business hint code only.
      let businessHint: string | undefined;
      if (res.status === 400 || res.status === 409 || res.status === 422) {
        businessHint = extractBusinessHint(text);
      }
      return { data: null, error: `upstream_${res.status}`, status: res.status, businessHint };
    }

    if (!text) return { data: null, error: null, status: res.status };

    try {
      return { data: JSON.parse(text) as T, error: null, status: res.status };
    } catch {
      return { data: null, error: "malformed_response", status: 502 };
    }
  } catch (err: any) {
    if (err?.name === "AbortError") return { data: null, error: "timeout", status: 504 };
    return { data: null, error: "network_error", status: 500 };
  }
}

// Map a PostgREST error body to an allowlisted business hint code. Only known
// hints are returned; anything else yields undefined (generic retry). Never
// returns raw SQL/message text.
function extractBusinessHint(text: string): string | undefined {
  if (!text) return undefined;
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    return undefined;
  }
  const msg: string = typeof body?.message === "string" ? body.message.toLowerCase() : "";
  if (!msg) return undefined;
  if (msg === "cleaner overlap on at least one visit")
    return "availability_detail:A cleaner is already booked at that time (including travel gap)";
  if (msg === "client email already exists") return "duplicate_email";
  if (msg === "property label already exists for this client") return "duplicate_property_label";
  if (msg.includes("duplicate") && msg.includes("email")) return "duplicate_email";
  if (
    msg.includes("duplicate") &&
    (msg.includes("property") || msg.includes("label") || msg.includes("site"))
  )
    return "duplicate_property_label";
  // Known availability messages → availability_detail:<friendly>. Only these
  // known messages are surfaced verbatim; anything else stays generic.
  if (msg.includes("working hours"))
    return "availability_detail:Outside a cleaner's working hours for that day";
  if (msg.includes("time off") || msg.includes("leave"))
    return "availability_detail:A cleaner is on leave that day";
  if (msg.includes("overlap") || msg.includes("gap"))
    return "availability_detail:A cleaner is already booked at that time (including travel gap)";
  if (msg.includes("availability")) return "availability_conflict";
  if (msg.includes("not open") || msg.includes("already booked")) return "request_not_open";
  // Benign, fixed business-validation message from the booking/confirm RPC
  // (not SQL or user input): surface it verbatim so the operator can see which
  // date/hours/price constraint failed instead of a generic "Please retry".
  if (msg.includes("check date") && msg.includes("hours") && msg.includes("price"))
    return "check_date_hours_price";
  return undefined;
}

// ---- Authentication (verified Supabase identity) ----

export interface SignInResult {
  user: AuthenticatedUser | null;
  error: string | null;
}

export async function authenticateWithSupabase(
  email: string,
  password: string,
): Promise<SignInResult> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return { user: null, error: "setup_required" };

  try {
    const res = await boundedFetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: cfg.publishableKey,
        "Content-Type": "application/json",
        "X-Client-Info": "repsuites",
      },
      body: JSON.stringify({ email, password }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      return { user: null, error: "invalid_credentials" };
    }

    const user = body?.user;
    if (!user?.id || !body?.access_token) {
      return { user: null, error: "invalid_credentials" };
    }

    return {
      user: {
        id: user.id,
        email: user.email ?? email,
        email_confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_in: Number(body.expires_in) || 0,
        expires_at:
          Number(body.expires_at) || Math.floor(Date.now() / 1000) + (Number(body.expires_in) || 0),
      },
      error: null,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") return { user: null, error: "timeout" };
    return { user: null, error: "auth_network_error" };
  }
}

// Refresh an access token using the refresh token. Returns fresh tokens or null.
export interface RefreshResult {
  user: AuthenticatedUser | null;
  error: string | null;
}

export async function refreshSession(refreshToken: string): Promise<RefreshResult> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return { user: null, error: "setup_required" };
  if (!refreshToken) return { user: null, error: "invalid_refresh_token" };

  try {
    const res = await boundedFetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: cfg.publishableKey,
        "Content-Type": "application/json",
        "X-Client-Info": "repsuites",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      return { user: null, error: "refresh_failed" };
    }

    const user = body?.user;
    if (!user?.id || !body?.access_token) {
      return { user: null, error: "refresh_failed" };
    }

    return {
      user: {
        id: user.id,
        email: user.email ?? "",
        email_confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
        access_token: body.access_token,
        refresh_token: body.refresh_token ?? refreshToken,
        expires_in: Number(body.expires_in) || 0,
        expires_at:
          Number(body.expires_at) || Math.floor(Date.now() / 1000) + (Number(body.expires_in) || 0),
      },
      error: null,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") return { user: null, error: "timeout" };
    return { user: null, error: "auth_network_error" };
  }
}

// Verify the current user identity using the stored access JWT via /auth/v1/user.
export interface VerifyIdentityResult {
  user: { id: string; email: string; email_confirmed: boolean } | null;
  error: string | null;
}

export async function verifyUserIdentity(jwt: string): Promise<VerifyIdentityResult> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return { user: null, error: "setup_required" };

  try {
    const res = await boundedFetch(`${cfg.url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: cfg.publishableKey,
        Authorization: `Bearer ${jwt}`,
        "X-Client-Info": "repsuites",
      },
    });

    if (!res.ok)
      return { user: null, error: res.status === 401 ? "identity_unverified" : "identity_error" };

    const body = await res.json().catch(() => null);
    if (!body?.id) return { user: null, error: "identity_unverified" };

    return {
      user: {
        id: body.id,
        email: body.email ?? "",
        email_confirmed: Boolean(body.email_confirmed_at || body.confirmed_at),
      },
      error: null,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") return { user: null, error: "timeout" };
    return { user: null, error: "auth_network_error" };
  }
}

// Revoke a Supabase session using the user JWT (best-effort on logout).
// Uses scope=local so we only sign out THIS session/device and do not affect
// other staging app sessions on other devices. Returns whether upstream
// reported success.
export async function revokeSupabaseSession(jwt: string): Promise<{ ok: boolean }> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return { ok: false };

  try {
    const res = await boundedFetch(`${cfg.url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        apikey: cfg.publishableKey,
        Authorization: `Bearer ${jwt}`,
        "X-Client-Info": "repsuites",
      },
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

// ---- staging_staff_password_status RPC ----
// Extracted into ./password-status.server.ts to keep this file focused.
// The RPC is SECURITY DEFINER and takes p_user_id (the verified session
// user_id) so auth.uid() being null on this Supabase project cannot block it.
export { checkPasswordStatus, type PasswordStatusResult } from "./password-status.server";

// ---- Tenant-scoped queries (all scoped to the authorised tenant_id) ----

export async function getTenants(jwt: string, tenantIds: string[]) {
  if (tenantIds.length === 0) return { tenants: [], error: null };
  const inList = tenantIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
  const res = await supabaseRest<Tenant[]>(`tenants?select=id,name,slug&id=in.(${inList})`, {
    jwt,
  });
  return { tenants: res.data || [], error: res.error };
}

export async function getTenantSettings(jwt: string, tenantId: string) {
  const res = await supabaseRest<TenantSettings[]>(
    `tenant_settings?select=tenant_id,timezone,currency,date_format&tenant_id=eq.${encodeURIComponent(tenantId)}`,
    { jwt },
  );
  const settings =
    Array.isArray(res.data) && res.data.length === 1 && res.data[0]?.tenant_id === tenantId
      ? res.data[0]
      : null;
  return { settings, error: res.error || (settings ? null : "settings_unavailable") };
}

// Re-exported from memberships.server.ts to avoid the RLS-blocked direct
// tenant_memberships table query (auth.uid() is null on this Supabase project).
// See memberships.server.ts for the SECURITY DEFINER RPC implementation.
export { verifyActiveTenantMembership } from "./memberships.server";

// Management roles permitted to view the operations overview / clients / sites / jobs.
export const MANAGEMENT_ROLES = ["owner", "admin", "manager", "super_admin"];

export function isManagementRole(role: string | undefined | null): boolean {
  return Boolean(role && MANAGEMENT_ROLES.includes(role));
}

export { getTenantMemberships } from "./memberships.server";
