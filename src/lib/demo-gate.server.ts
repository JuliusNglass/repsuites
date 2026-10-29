// Server-only demo-session gate.
//
// Per the approved design, "demo user" is decided from WHO is signed in
// (the verified email), not from a session flag set only by the /demo
// button. This means anyone who somehow obtained the demo manager's
// credentials and used the normal sign-in page is STILL treated as a demo
// user and restricted — the flag cannot be bypassed by signing in a
// different way.
//
// The demo manager email and demo tenant id are read from env at call time
// (inside .handler / guard bodies), never at module scope.
//
// ALLOW-LIST, not block-list: demo sessions may only perform the actions
// explicitly listed here. Anything else is refused. This means a feature
// added later is NOT open to demo visitors by default.

import { getRequestHeader } from "@tanstack/react-start/server";
import { serviceWrite } from "./supabase-service.server";

const DEMO_TENANT_ID = "a1b2c3d4-e5f6-4789-abcd-ef0123456789";

/** The demo tenant UUID (the only tenant demo visitors may touch). */
export function getDemoTenantId(): string {
  return DEMO_TENANT_ID;
}

// The demo manager has no staff record, so the job board opens with the
// first demo cleaner (Priya Shah) and lets the visitor switch between all
// demo cleaners. We do NOT hardcode a staff UUID here — the real IDs live
// in the database and are resolved from the staff list at read time.

// Track consecutive log-insert failures. After 3, fail closed — block
// sign-ins rather than silently allowing unlimited demo sessions.
let consecutiveLogFailures = 0;
const MAX_CONSECUTIVE_LOG_FAILURES = 3;

/**
 * Log a demo sign-in to the demo_signin_log table (service-role only, RLS
 * with no policies). The table has only id, ip_address and created_at —
 * no user_agent column.
 *
 * Returns false when consecutive logging failures reach or exceed the
 * threshold (3), signaling callers to fail closed and block sign-in.
 */
export async function logDemoSignIn(): Promise<boolean> {
  const fwd = getRequestHeader("x-forwarded-for");
  const ip =
    (getRequestHeader("cf-connecting-ip") || "").trim() ||
    (fwd ? fwd.split(",")[0]?.trim() || "" : "") ||
    (getRequestHeader("x-real-ip") || "").trim() ||
    "unknown";

  const result = await serviceWrite<unknown>("demo_signin_log", "", {
    method: "POST",
    body: { ip_address: ip },
  });

  if (result.error) {
    consecutiveLogFailures++;
    console.error("[demo-signin-log] Failed to write sign-in log:", result.error);
    if (consecutiveLogFailures >= MAX_CONSECUTIVE_LOG_FAILURES) {
      return false; // fail closed
    }
    return true; // allow transient failure under limit
  }

  consecutiveLogFailures = 0;
  return true;
}

/**
 * The demo manager email, read from env at call time. When unset, no user is
 * treated as a demo user (the feature is effectively disabled).
 */
export function getDemoManagerEmail(): string | null {
  const v = (process.env["REPSUITES_DEMO_EMAIL"] || "").trim().toLowerCase();
  return v || null;
}

/**
 * The demo manager password, read from env at call time. Used only by the
 * demo sign-in server function. Never logged, never returned to the client.
 */
export function getDemoManagerPassword(): string | null {
  const v = (process.env["REPSUITES_DEMO_PASSWORD"] || "").trim();
  return v || null;
}

/**
 * True when the signed-in user's email matches the demo manager email.
 * This is the authoritative "is this a demo session?" check, evaluated on
 * every protected request from the verified identity — not from a cookie
 * flag. Case-insensitive comparison.
 */
export function isDemoEmail(email: string | undefined | null): boolean {
  const demoEmail = getDemoManagerEmail();
  if (!demoEmail || !email) return false;
  return email.trim().toLowerCase() === demoEmail;
}

/**
 * True when the active tenant is the demo tenant. Used to keep demo
 * visitors locked to the demo business even if they somehow had other
 * memberships.
 */
export function isDemoTenant(tenantId: string | undefined | null): boolean {
  return tenantId === DEMO_TENANT_ID;
}

// ---- Allow-list of permitted actions for demo sessions ----
//
// Each entry is a server-function identifier (the property name exported
// from api.functions.ts). Demo sessions may call ONLY these. Reads are
// generally allowed (dashboard, schedule, clients, requests, pricing,
// quality, team, connections, checklists) so prospects can explore. Writes
// are limited to creating/editing jobs, requests, clients, sites, and
// ticking checklists. Everything else (invites, role changes, exports,
// deletes, settings saves, CRM connect/disconnect, tenant provisioning,
// pricing changes, checklist template edits) is refused.

const DEMO_ALLOWED = new Set<string>([
  // Reads (exploration)
  "getSystemStatus",
  "getDashboardData",
  "getScheduleData",
  "getClientsData",
  "getRequestsData",
  "getBookingFormData",
  "getUserTenants",
  "getTeamData",
  "getRescheduleContext",
  "getPricingData",
  "getQualityData",
  "getCleanerWorkspace",
  "getRoster",
  "getSetupStatus",
  "getConnections",
  "getAgencyConnectionStatus",
  "getStaffList",
  "getPriceEstimate",
  "getSignedInUser",
  "getImpersonation",
  "getAgencyAccess",
  "getConnectionDrafts",
  // Writes (interactive demo)
  "saveDirectory", // create/edit clients + sites
  "createFlowClient", // inline new client + property
  "saveRequest", // create/edit cleaning requests
  "bookJob", // book a job
  "confirmRequest", // confirm a request into a booking
  "runJobStart", // cleaner: start a clean
  "runJobFinish", // cleaner: finish a clean
  "moveVisit", // reschedule a visit
  "changeDuration", // edit duration
  "cancelVisit", // cancel a visit
  // Sign-out + tenant selection (so the demo session can end)
  "signOut",
  "selectTenant",
  // Password reset (harmless for demo)
  "forgotPassword",
  "verifyRecoveryToken",
  "resetPassword",
]);

/**
 * Returns true if the named server function is permitted for a demo
 * session. Called by the demo guard wrapper in api.functions.ts.
 */
export function isDemoAllowed(fnName: string): boolean {
  return DEMO_ALLOWED.has(fnName);
}

/**
 * The set of server functions that are READ-ONLY for demo sessions: they
 * are allowed to READ pricing, settings, and checklists, but NOT to write
 * to them. These are in the allow-list above as reads; their write
 * counterparts are simply absent from the allow-list.
 */
export const DEMO_READONLY_AREAS = ["pricing", "settings", "checklist templates"] as const;

/**
 * Guard for write builders: returns a denial when a demo user attempts a
 * blocked action. Called at the top of each write builder that is NOT in
 * the demo allow-list. The builder receives the guard result (which now
 * carries is_demo) and passes it here with a human-readable label.
 *
 * Returns a denial object (ok: false) or null when the action is allowed.
 */
export function demoBlock(
  isDemo: boolean,
  label: string,
): { ok: false; status: number; error: string } | null {
  if (!isDemo) return null;
  return {
    ok: false,
    status: 403,
    error: `The demo account can't change ${label}. This is a read-only demo.`,
  };
}
