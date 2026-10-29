// Server-only session & auth operations.
// HttpOnly + Secure + SameSite cookies, no-store on sensitive endpoints,
// verified Supabase identity on every protected request, refresh-token
// rotation with a BOUNDED absolute session lifetime, and strict
// request-origin guards.
import {
  getRequestHeader,
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
} from "@tanstack/react-start/server";
import { getSupabaseConfig, describeMissingConfig } from "./config.server";
import { encryptSessionData, decryptSessionData, safeEqual } from "./session.server";
import { isDemoEmail, isDemoTenant, getDemoTenantId } from "./demo-gate.server";
import {
  authenticateWithSupabase,
  refreshSession,
  verifyUserIdentity,
  revokeSupabaseSession,
  checkPasswordStatus,
  getTenantMemberships,
  getTenants,
  getTenantSettings,
  verifyActiveTenantMembership,
  isManagementRole,
  type AuthenticatedUser,
  type TenantMembership,
  type TenantSettings,
} from "./supabase.server";
import { getTenantSettingsService } from "./supabase-service.server";
import { isTenantDomainOrigin, resolveHostTenant } from "./tenant-domain.server";
import { restrictToHostTenant, notMemberMessage } from "./tenant-domain";
import { changeBlockedFor } from "./tenant-access.server";

const COOKIE_NAME = "repsuites_session";
// Bounded ABSOLUTE session lifetime: 8 hours from sign-in, regardless of how
// many refreshes occur. Refresh only renews the access token, never extends
// the absolute session.
const ABSOLUTE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
// Refresh the access token when it is within this many seconds of expiry.
const REFRESH_MARGIN_SECONDS = 60;

export interface SessionPayload {
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  // Absolute session boundary (seconds since epoch). Fixed at sign-in; never
  // extended by refresh. Once passed, the session is rejected outright.
  absolute_session_expires_at: number;
  // Access-token expiry (seconds since epoch). May be renewed by refresh.
  access_expires_at: number;
  active_tenant_id?: string | undefined;
  role?: string | undefined;
  can_clean?: boolean | undefined;
  // Admin "View as cleaner" impersonation. When set, data reads filter by
  // this staff_id instead of the signed-in user's own staff_id. The
  // impersonating_staff_name is shown in the gold banner.
  impersonating_staff_id?: string | undefined;
  impersonating_staff_name?: string | undefined;
}

export interface ProtectedContext {
  ok: true;
  session: SessionPayload;
  user: { id: string; email: string; email_confirmed: boolean };
  membership: TenantMembership;
  settings: TenantSettings | null;
  // True when the signed-in user is the demo manager (decided from the
  // verified email, not a session flag). Write endpoints check this to
  // enforce the demo allow-list.
  is_demo: boolean;
}

export interface ProtectedDenial {
  ok: false;
  status: number;
  error: string;
  blockedPasswordSetup?: boolean | undefined;
}

export type ProtectedResult = ProtectedContext | ProtectedDenial;

// ---- cookie helpers ----

// Parse a Cookie header into a map, tolerating malformed percent-encoding.
// A single malformed cookie value must not poison the whole jar.
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    const raw = part.slice(eq + 1).trim();
    // decodeURIComponent can throw on malformed % sequences - guard it.
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      value = raw;
    }
    out[key] = value;
  }
  return out;
}

function buildSetCookie(value: string, maxAge: number): string {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function setServerSessionCookie(session: SessionPayload): Promise<void> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return;
  const encrypted = await encryptSessionData(
    session as unknown as Record<string, unknown>,
    cfg.sessionSecret,
  );
  // Cookie Max-Age is bounded by the REMAINING absolute session lifetime, so a
  // refreshed session does not extend the cookie beyond the fixed boundary.
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, session.absolute_session_expires_at - now);
  setResponseHeader("Set-Cookie", buildSetCookie(encrypted, remaining));
}

export function clearServerSessionCookie(): void {
  setResponseHeader("Set-Cookie", buildSetCookie("", 0));
}

export function applyNoStoreHeaders(): void {
  setResponseHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, private",
  );
  setResponseHeader("Pragma", "no-cache");
  setResponseHeader("Expires", "0");
  setResponseHeader("X-Content-Type-Options", "nosniff");
  setResponseHeader("X-Frame-Options", "DENY");
}

// ---- strict request-origin guard (no permissive referer fallback) ----
// The raw Origin header must EXACTLY equal a canonical HTTPS origin
// (scheme://host[:port]) with no credentials, path, query, or hash, and must
// then equal the trusted deployment origin OR a platform-managed
// *.vibepreview.app origin (the platform's own preview/published domains,
// all HTTPS). A path-bearing Origin such as https://host/other is rejected
// even when its host matches the trusted host.
// Missing/bad origin fails closed for all state-changing requests.

function isPlatformManagedOrigin(originUrl: string): boolean {
  try {
    const u = new URL(originUrl);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (u.pathname !== "/") return false;
    if (u.search || u.hash) return false;
    if (originUrl !== u.origin) return false;
    // Platform-managed preview/published domains end with .vibepreview.app.
    // This is safe because these subdomains are provisioned by the platform
    // itself and are all HTTPS.
    return u.hostname.endsWith(".vibepreview.app");
  } catch {
    return false;
  }
}

function isTrustedOrigin(origin: string, cfg: ReturnType<typeof getSupabaseConfig>): boolean {
  // Accept the explicitly configured deployment origin...
  if (cfg.appOrigin && safeEqual(origin, cfg.appOrigin)) return true;
  // ...or a platform-managed *.vibepreview.app origin.
  return isPlatformManagedOrigin(origin);
}

// Parse the Origin (and Referer, if present) and check each against
// `trusted`. Shared by the sync and async guards so both apply the same
// strict shape rules.
function originsFromRequest(): { origin: string; refererOrigin: string | null } | null {
  const origin = getRequestHeader("origin");
  if (!origin) return null; // no referer fallback

  // The supplied Origin must be an exact HTTPS origin with no path/query/hash.
  let suppliedOrigin: string;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (u.pathname !== "/") return null;
    if (u.search) return null;
    if (u.hash) return null;
    if (origin !== u.origin) return null; // raw must equal parsed origin
    suppliedOrigin = u.origin;
  } catch {
    return null;
  }

  // If a referer is present, its origin must also be trusted.
  const referer = getRequestHeader("referer");
  let refererOrigin: string | null = null;
  if (referer) {
    try {
      const r = new URL(referer);
      if (r.protocol !== "https:") return null;
      if (r.username || r.password) return null;
      refererOrigin = r.origin;
    } catch {
      return null;
    }
  }
  return { origin: suppliedOrigin, refererOrigin };
}

// Sync guard: the configured deployment origin or a platform-managed origin.
export function verifyRequestOrigin(): boolean {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured || !cfg.appOrigin) return false;
  const o = originsFromRequest();
  if (!o) return false;
  if (!isTrustedOrigin(o.origin, cfg)) return false;
  if (o.refererOrigin && !isTrustedOrigin(o.refererOrigin, cfg)) return false;
  return true;
}

// Full guard used by every state-changing endpoint: everything the sync guard
// accepts, plus https://<an active business custom domain>
// (public.tenant_domains). The same strict shape rules apply.
export async function verifyRequestOriginAsync(): Promise<boolean> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured || !cfg.appOrigin) return false;
  const o = originsFromRequest();
  if (!o) return false;
  const trusted = async (origin: string) =>
    isTrustedOrigin(origin, cfg) || (await isTenantDomainOrigin(origin));
  if (!(await trusted(o.origin))) return false;
  if (o.refererOrigin && !(await trusted(o.refererOrigin))) return false;
  return true;
}

// ---- session read ----

// Validate the decrypted payload structure: finite timestamps, nonempty
// tokens, and a UUID-shaped user_id. Reject tampered/short/malformed payloads.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isFiniteTimestamp(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function isValidSessionPayload(data: unknown): data is SessionPayload {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d["user_id"] === "string" &&
    UUID_RE.test(d["user_id"]) &&
    typeof d["access_token"] === "string" &&
    d["access_token"].length > 0 &&
    typeof d["refresh_token"] === "string" &&
    d["refresh_token"].length > 0 &&
    isFiniteTimestamp(d["absolute_session_expires_at"]) &&
    isFiniteTimestamp(d["access_expires_at"])
  );
}

export async function getServerSession(): Promise<SessionPayload | null> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return null;

  const cookieHeader = getRequestHeader("cookie") || null;
  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const data = await decryptSessionData<SessionPayload>(token, cfg.sessionSecret);
  if (!isValidSessionPayload(data)) return null;

  // Reject once the ABSOLUTE session lifetime has passed.
  if (Math.floor(Date.now() / 1000) > data.absolute_session_expires_at) return null;

  return data;
}

// Refresh the access token if it is within the refresh margin (or already
// past), verifying the refreshed identity afterwards. The absolute session
// boundary is PRESERVED (never extended). Mutates the passed session in place.
// Exported so the narrow cleaner pipeline can reuse the same refresh logic
// (preserving the fixed 8h absolute lifetime) before identity verification.
export async function maybeRefresh(
  session: SessionPayload,
): Promise<{ ok: boolean; error?: string }> {
  const now = Math.floor(Date.now() / 1000);
  // Only refresh if the access token is near/past expiry AND the absolute
  // session is still valid.
  if (session.access_expires_at - now > REFRESH_MARGIN_SECONDS) return { ok: true };
  if (now > session.absolute_session_expires_at)
    return { ok: false, error: "absolute_session_expired" };

  const refreshed = await refreshSession(session.refresh_token);
  if (refreshed.error || !refreshed.user) {
    return { ok: false, error: refreshed.error || "refresh_failed" };
  }

  // Verify identity after refresh - never trust refreshed tokens blindly.
  const identity = await verifyUserIdentity(refreshed.user.access_token);
  if (identity.error || !identity.user) {
    return { ok: false, error: identity.error || "identity_unverified" };
  }
  if (identity.user.id !== session.user_id) {
    return { ok: false, error: "identity_mismatch" };
  }
  if (!identity.user.email_confirmed) {
    return { ok: false, error: "email_not_confirmed" };
  }

  // Renew access token + refresh token + access expiry. Absolute session
  // boundary is preserved (NOT extended).
  session.access_token = refreshed.user.access_token;
  session.refresh_token = refreshed.user.refresh_token;
  session.access_expires_at = refreshed.user.expires_at;
  session.email = refreshed.user.email || session.email;
  return { ok: true };
}

// ---- shared verified pipeline ----
// Verifies current Supabase identity, confirmed email, password-status RPC,
// and (optionally) current active management membership. Used by every
// protected endpoint and tenant selection so none bypass refresh.

interface VerifiedPipelineOptions {
  requireTenant?: boolean;
  // For selectTenant: the target tenant to verify membership against.
  targetTenantId?: string;
}

interface VerifiedPipelineSuccess {
  ok: true;
  session: SessionPayload;
  user: { id: string; email: string; email_confirmed: boolean };
  membership: TenantMembership;
  settings: TenantSettings | null;
  is_demo: boolean;
}

type VerifiedPipelineResult = VerifiedPipelineSuccess | ProtectedDenial;

async function runVerifiedPipeline(
  opts: VerifiedPipelineOptions = {},
): Promise<VerifiedPipelineResult> {
  const cookiePresent = Boolean(getRequestHeader("cookie"));
  const session = await getServerSession();
  if (!session) {
    // Clear an invalid/malformed/expired cookie when one was present.
    if (cookiePresent) clearServerSessionCookie();
    return { ok: false, status: 401, error: "Unauthorized - sign in required" };
  }

  // Refresh BEFORE identity verification when access expiry is near/past but
  // the absolute session is still valid. This avoids rejecting a quiet user
  // whose access token has expired.
  const refreshRes = await maybeRefresh(session);
  if (!refreshRes.ok) {
    clearServerSessionCookie();
    return { ok: false, status: 401, error: "Unauthorized - session expired" };
  }
  // Persist the (possibly refreshed) session.
  await setServerSessionCookie(session);

  // Verify current Supabase identity using the stored access JWT.
  const identity = await verifyUserIdentity(session.access_token);
  if (identity.error || !identity.user) {
    clearServerSessionCookie();
    return { ok: false, status: 401, error: "Unauthorized - session invalid" };
  }
  if (identity.user.id !== session.user_id) {
    clearServerSessionCookie();
    return { ok: false, status: 401, error: "Unauthorized - identity mismatch" };
  }
  if (!identity.user.email_confirmed) {
    clearServerSessionCookie();
    return { ok: false, status: 403, error: "Email not confirmed" };
  }

  // Recheck password status RPC on every protected request. Pass the verified
  // session user_id as p_user_id (SECURITY DEFINER RPC).
  const pwdStatus = await checkPasswordStatus(session.access_token, session.user_id);
  if (pwdStatus.deny || pwdStatus.needsChange) {
    clearServerSessionCookie();
    return {
      ok: false,
      status: 403,
      blockedPasswordSetup: true,
      error: "Password setup pending - access blocked.",
    };
  }

  // On a business's own web address, that business is the only tenant this
  // session can use. Membership is still verified below.
  const hostTenant = await resolveHostTenant();
  if (hostTenant && opts.targetTenantId && opts.targetTenantId !== hostTenant.tenantId) {
    return { ok: false, status: 403, error: notMemberMessage(hostTenant) };
  }

  // Determine the tenant to verify membership against.
  const tenantId = hostTenant?.tenantId ?? opts.targetTenantId ?? session.active_tenant_id;

  if (opts.requireTenant) {
    if (!tenantId || !UUID_RE.test(tenantId)) {
      return { ok: false, status: 403, error: "No active business tenant selected" };
    }

    // Recheck current active tenant membership for this protected request.
    const authCheck = await verifyActiveTenantMembership(
      session.access_token,
      session.user_id,
      tenantId,
    );
    if (!authCheck.authorized || !authCheck.membership) {
      clearServerSessionCookie();
      return { ok: false, status: 403, error: "Unauthorized - tenant access revoked or inactive" };
    }
    if (!isManagementRole(authCheck.membership.role)) {
      clearServerSessionCookie();
      return { ok: false, status: 403, error: "Management role required - access denied" };
    }

    session.active_tenant_id = tenantId;
    session.role = authCheck.membership.role;
    session.can_clean = authCheck.membership.can_clean;
    await setServerSessionCookie(session);

    let settingsRes = await getTenantSettings(session.access_token, tenantId);
    // Fallback to service-role read when the JWT path fails (ES256/PostgREST
    // schema-cache issue). Without settings, readTeamData's timezone gate
    // returns empty staff, so this fallback is what makes the team page load.
    if (!settingsRes.settings) {
      settingsRes = await getTenantSettingsService(session.access_token, tenantId);
    }
    return {
      ok: true,
      session,
      user: identity.user,
      membership: authCheck.membership,
      settings: settingsRes.settings,
      is_demo: isDemoEmail(identity.user.email),
    };
  }

  // requireTenant === false: query CURRENT active management memberships rather
  // than fabricating one from the cached cookie role.
  const memRes = await getTenantMemberships(session.access_token, session.user_id);
  if (memRes.error || !memRes.memberships.length) {
    clearServerSessionCookie();
    return { ok: false, status: 403, error: "No active business membership found" };
  }
  const management = restrictToHostTenant(
    memRes.memberships.filter((m) => isManagementRole(m.role)),
    hostTenant,
  );
  if (management.length === 0) {
    clearServerSessionCookie();
    return { ok: false, status: 403, error: "Management role required - access denied" };
  }

  // If a target tenant was supplied (selectTenant), verify membership for it.
  if (opts.targetTenantId) {
    const target = management.find((m) => m.tenant_id === opts.targetTenantId);
    if (!target) {
      return { ok: false, status: 403, error: "Unauthorized access to selected business tenant" };
    }
    session.active_tenant_id = target.tenant_id;
    session.role = target.role;
    session.can_clean = target.can_clean;
    await setServerSessionCookie(session);
    return {
      ok: true,
      session,
      user: identity.user,
      membership: target,
      settings: null,
      is_demo: isDemoEmail(identity.user.email),
    };
  }

  return {
    ok: true,
    session,
    user: identity.user,
    membership: management[0]!,
    settings: null,
    is_demo: isDemoEmail(identity.user.email),
  };
}

// ---- sign in ----

export interface SignInResponse {
  ok: boolean;
  status: number;
  error?: string;
  blockedPasswordSetup?: boolean | undefined;
  tenants?: { id: string; name: string; slug: string }[];
  memberships?: TenantMembership[];
  active_tenant_id?: string | undefined;
}

export async function performSignIn(email: string, password: string): Promise<SignInResponse> {
  applyNoStoreHeaders();

  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    return { ok: false, status: 503, error: describeMissingConfig(cfg.missing) };
  }

  if (!(await verifyRequestOriginAsync())) {
    setResponseStatus(403);
    return { ok: false, status: 403, error: "Invalid request origin" };
  }

  // The demo manager account must NEVER be used through the normal sign-in
  // page. It gets a restricted 60-minute session only via the /demo button.
  // Refuse it here so credentials leaked elsewhere cannot unlock a full
  // 8-hour unrestricted session.
  if (isDemoEmail(email)) {
    setResponseStatus(403);
    return {
      ok: false,
      status: 403,
      error: "This account is for the interactive demo only. Use the “Try the demo” button.",
    };
  }

  const authRes = await authenticateWithSupabase(email, password);
  if (authRes.error || !authRes.user) {
    setResponseStatus(401);
    return { ok: false, status: 401, error: "Invalid sign-in credentials" };
  }
  const authed: AuthenticatedUser = authRes.user;

  // Require a confirmed email before granting any workspace access.
  if (!authed.email_confirmed) {
    setResponseStatus(403);
    return {
      ok: false,
      status: 403,
      error: "Email address not confirmed. Confirm it before signing in.",
    };
  }

  // staging_staff_password_status RPC - rechecked on every protected request
  // too. Pass the verified authed.id as p_user_id (SECURITY DEFINER RPC).
  const pwdStatus = await checkPasswordStatus(authed.access_token, authed.id);
  if (pwdStatus.deny || pwdStatus.needsChange) {
    setResponseStatus(403);
    return {
      ok: false,
      status: 403,
      blockedPasswordSetup: true,
      error:
        "First-password setup pending. Account changes are disabled until your password is set. Access blocked.",
    };
  }

  // Active tenant memberships.
  const memRes = await getTenantMemberships(authed.access_token, authed.id);
  if (memRes.error || !memRes.memberships.length) {
    setResponseStatus(403);
    return {
      ok: false,
      status: 403,
      error: "No active business tenant membership found for this account.",
    };
  }

  // Only management roles may access this workspace.
  const managementMemberships = memRes.memberships.filter((m) => isManagementRole(m.role));
  if (managementMemberships.length === 0) {
    setResponseStatus(403);
    return {
      ok: false,
      status: 403,
      error: "Management role required. Cleaner and unknown roles are not permitted in this pilot.",
    };
  }

  // On a business's own web address, only that business's members get in.
  const hostTenant = await resolveHostTenant();
  if (hostTenant) {
    const here = restrictToHostTenant(managementMemberships, hostTenant);
    if (here.length === 0) {
      setResponseStatus(403);
      return { ok: false, status: 403, error: notMemberMessage(hostTenant) };
    }
    managementMemberships.splice(0, managementMemberships.length, ...here);
  }

  const tenantIds = managementMemberships.map((m) => m.tenant_id);
  const tenantRes = await getTenants(authed.access_token, tenantIds);

  const initialTenantId = tenantIds[0];
  const initialMem = managementMemberships.find((m) => m.tenant_id === initialTenantId);

  const now = Math.floor(Date.now() / 1000);
  const sessionPayload: SessionPayload = {
    user_id: authed.id,
    email: authed.email,
    access_token: authed.access_token,
    refresh_token: authed.refresh_token,
    absolute_session_expires_at: now + ABSOLUTE_SESSION_MAX_AGE_SECONDS,
    access_expires_at: authed.expires_at,
    active_tenant_id: initialTenantId,
    role: initialMem?.role,
    can_clean: initialMem?.can_clean,
  };

  await setServerSessionCookie(sessionPayload);

  return {
    ok: true,
    status: 200,
    tenants: tenantRes.tenants,
    memberships: managementMemberships,
    active_tenant_id: initialTenantId,
  };
}

// ---- tenant selection ----

export interface SelectTenantResponse {
  ok: boolean;
  status: number;
  error?: string;
  blockedPasswordSetup?: boolean | undefined;
  active_tenant_id?: string | undefined;
  role?: string | undefined;
}

export async function performSelectTenant(tenantId: string): Promise<SelectTenantResponse> {
  applyNoStoreHeaders();

  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    return { ok: false, status: 503, error: describeMissingConfig(cfg.missing) };
  }

  if (!(await verifyRequestOriginAsync())) {
    setResponseStatus(403);
    return { ok: false, status: 403, error: "Invalid request origin" };
  }

  // UUID-validate the tenant input before any upstream call.
  if (!tenantId || !UUID_RE.test(tenantId)) {
    setResponseStatus(400);
    return { ok: false, status: 400, error: "Invalid tenant id" };
  }

  // Use the shared verified pipeline with the target tenant - this includes
  // refresh, identity verification, password RPC, and current membership.
  const result = await runVerifiedPipeline({ requireTenant: false, targetTenantId: tenantId });
  if (!result.ok) {
    setResponseStatus(result.status);
    return {
      ok: false,
      status: result.status,
      error: result.error,
      blockedPasswordSetup: result.blockedPasswordSetup,
    };
  }

  return { ok: true, status: 200, active_tenant_id: tenantId, role: result.session.role };
}

// ---- the protected-request guard used by all data endpoints ----

export interface GuardOptions {
  requireTenant?: boolean;
  // POST server functions are treated as changes and are refused while the
  // business is read-only or on hold. Set this on the few POST functions that
  // only read (for example a price estimate).
  allowWhenLocked?: boolean;
}

export async function requireProtectedRequest(opts: GuardOptions = {}): Promise<ProtectedResult> {
  applyNoStoreHeaders();

  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    return { ok: false, status: 503, error: describeMissingConfig(cfg.missing) };
  }

  const result = await runVerifiedPipeline({ requireTenant: opts.requireTenant ?? false });
  if (!result.ok) return result;

  if (!opts.allowWhenLocked) {
    const blocked = await changeBlockedFor(
      result.session.access_token,
      result.session.active_tenant_id,
      "management",
    );
    if (blocked) {
      // A normal answer (not an HTTP error) so every page shows the message.
      return { ok: false, status: 423, error: blocked };
    }
  }

  return {
    ok: true,
    session: result.session,
    user: result.user,
    membership: result.membership,
    settings: result.settings,
    is_demo: result.is_demo,
  };
}

// ---- sign out ----

export interface SignOutResponse {
  ok: boolean;
  status: number;
  error?: string;
}

export async function performSignOut(): Promise<SignOutResponse> {
  applyNoStoreHeaders();

  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    return { ok: false, status: 503, error: describeMissingConfig(cfg.missing) };
  }

  if (!(await verifyRequestOriginAsync())) {
    setResponseStatus(403);
    return { ok: false, status: 403, error: "Invalid request origin" };
  }

  const session = await getServerSession();
  // Always clear the local cookie regardless of upstream outcome.
  clearServerSessionCookie();

  if (session?.access_token) {
    // Best-effort revocation of THIS session only (scope=local) so other
    // devices/apps are not signed out.
    await revokeSupabaseSession(session.access_token);
  }

  return { ok: true, status: 200 };
}
