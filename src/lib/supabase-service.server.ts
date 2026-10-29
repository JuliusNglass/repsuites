// Service-role REST reads.
//
// Server functions run in a trusted environment. Tenant isolation is enforced
// by filtering on tenant_id derived from the verified session
// (requireProtectedRequest), NOT by RLS. These helpers use the service role
// key (REPSUITES_SERVICE_KEY) as the PostgREST apikey with no Authorization
// header, so PostgREST runs as service_role and bypasses RLS. This avoids the
// ES256/PostgREST schema-cache issues that silently drop data when reads go
// through the user JWT.
//
// SECURITY: every call MUST pass an explicit tenant_id filter. The tenant_id
// comes from the verified session, never user input. Auth/identity calls
// (authenticateWithSupabase, verifyUserIdentity, password RPC, memberships
// RPC) stay on the user JWT in supabase.server.ts - they are NOT routed here.
//
// When REPSUITES_SERVICE_KEY is unset (e.g. in unit tests), these fall back to
// the user-JWT path via supabaseRest, so existing test mocks keep working.

import { supabaseRest } from "./supabase.server";
import { getSupabaseConfig } from "./config.server";
import type { Tenant, TenantSettings } from "./supabase.server";

const DEFAULT_TIMEOUT_MS = 8000;

function serviceKey(): string {
  return (process.env["REPSUITES_SERVICE_KEY"] || "").trim();
}

// For server-only callers that must reach a non-PostgREST admin endpoint.
export function getServiceKey(): string {
  return serviceKey();
}

// Returns true when the service role key is configured. When false, callers
// fall back to the JWT-scoped supabaseRest so tests (which mock fetch and do
// not set the service key) behave exactly as before.
export function hasServiceRole(): boolean {
  return Boolean(serviceKey());
}

// Service-role REST request. Uses the service key as apikey with NO
// Authorization header. Mirrors supabaseRest's error handling.
async function serviceRest<T>(
  endpoint: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{
  data: T | null;
  error: string | null;
  status: number;
  businessHint?: string | undefined;
  message?: string | undefined;
}> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    return { data: null, error: "Configuration required", status: 500 };
  }

  const key = serviceKey();
  const url = `${cfg.url}/rest/v1/${endpoint}`;
  const isJwtKey = key.startsWith("eyJ");
  const headers: Record<string, string> = {
    apikey: key || cfg.publishableKey,
    "Content-Type": "application/json",
    "X-Client-Info": "repsuites",
  };
  // Legacy JWT service keys require Authorization: Bearer to trigger the
  // service_role bypass in PostgREST. Without it, the request runs as anon
  // (no RLS policies on most tables -> empty arrays). Modern sb_secret_*
  // opaque keys must NOT have an Authorization header (PostgREST rejects
  // them with "Expected 3 parts in JWT").
  if (isJwtKey) {
    headers["Authorization"] = `Bearer ${key}`;
  }
  // Merge caller-supplied headers (e.g. Prefer: return=representation) last
  // so they override the defaults without dropping apikey/Content-Type.
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) headers[k] = v;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      signal: controller.signal,
      cache: "no-store" as any,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    if (res.status === 204) return { data: null, error: null, status: 204 };
    const text = await res.text();
    if (!res.ok) {
      // Surface the PostgREST `message` field (a constraint/validation
      // message, not raw SQL or user data) so callers can show the real
      // reason a save was rejected instead of a generic "save_failed".
      let message: string | undefined;
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.message === "string") message = parsed.message;
      } catch {
        // not JSON; leave message undefined
      }
      return { data: null, error: `upstream_${res.status}`, status: res.status, message };
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
  } finally {
    clearTimeout(timer);
  }
}

// Pick service-role when available, else fall back to JWT-scoped supabaseRest.
// Exported so other server-only read modules (e.g. normalized pricing) can use
// the same hardened path without duplicating the service-role fallback logic.
export async function serviceRead<T>(
  endpoint: string,
  jwt: string,
): Promise<{ data: T | null; error: string | null }> {
  if (hasServiceRole()) {
    const r = await serviceRest<T>(endpoint);
    return { data: r.data, error: r.error };
  }
  const r = await supabaseRest<T>(endpoint, { jwt });
  return { data: r.data, error: r.error };
}

// Service-role write (POST/PATCH/DELETE). Falls back to JWT-scoped supabaseRest
// when the service key is not configured (tests). Same pattern as serviceRead.
export async function serviceWrite<T>(
  endpoint: string,
  jwt: string,
  options: { method: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ data: T | null; error: string | null; message?: string | undefined }> {
  if (hasServiceRole()) {
    const r = await serviceRest<T>(endpoint, options);
    return { data: r.data, error: r.error, message: r.message };
  }
  const r = await supabaseRest<T>(endpoint, { ...options, jwt });
  return { data: r.data, error: r.error, message: r.businessHint };
}

// Local alias used by every *Service function below. Without this the calls
// reference an undefined `read` and throw ReferenceError at runtime (the build
// passes because TS treats the bare name as a global, but the Worker crashes).
async function read<T>(
  endpoint: string,
  jwt: string,
): Promise<{ data: T | null; error: string | null }> {
  return serviceRead<T>(endpoint, jwt);
}

// ---- Service-role read functions (mirror supabase.server.ts signatures) ----
// Every query includes an explicit tenant_id filter - that is the tenant wall.

// Tenant settings via service role. The JWT-based getTenantSettings in
// supabase.server.ts is the one read that gates the entire team page (timezone
// gate in readTeamData). When it fails on the ES256/PostgREST path, settings
// comes back null and readTeamData returns empty staff. This service-role
// mirror avoids that single point of failure.
export async function getTenantSettingsService(jwt: string, tenantId: string) {
  const r = await read<TenantSettings[]>(
    `tenant_settings?select=tenant_id,timezone,currency,date_format&tenant_id=eq.${encodeURIComponent(tenantId)}`,
    jwt,
  );
  const settings =
    Array.isArray(r.data) && r.data.length === 1 && r.data[0]?.tenant_id === tenantId
      ? r.data[0]
      : null;
  return { settings, error: r.error || (settings ? null : "settings_unavailable") };
}

export async function getTenantsService(jwt: string, tenantIds: string[]) {
  if (tenantIds.length === 0) return { tenants: [] as Tenant[], error: null as string | null };
  const inList = tenantIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
  const r = await read<Tenant[]>(`tenants?select=id,name,slug&id=in.(${inList})`, jwt);
  return { tenants: r.data || [], error: r.error };
}
