// Server-only tenant-memberships reads via the SECURITY DEFINER RPC.
//
// repsuites_get_my_memberships is SECURITY DEFINER (bypasses RLS) and returns
// the correct active memberships for the supplied user_id. It returns:
// tenant_id, user_id, role, active, can_clean.
//
// Route through the service key (serviceWrite uses REPSUITES_SERVICE_KEY as
// apikey with no Authorization header, bypassing RLS). The user_id comes only
// from the verified session (verifyUserIdentity), never from user input.
// Falls back to the user-JWT path in tests (no service key configured).
import { getSupabaseConfig } from "./config.server";
import type { TenantMembership } from "./supabase.server";
import { serviceWrite } from "./supabase-service.server";

export async function getTenantMemberships(jwt: string, userId: string) {
  const res = await serviceWrite<TenantMembership[]>(`rpc/repsuites_get_my_memberships`, jwt, {
    method: "POST",
    body: { p_user_id: userId },
  });
  if (res.error || !res.data) return { memberships: [], error: res.error };
  return { memberships: res.data, error: null };
}

// Verify the user has an active management membership for the given tenant.
// Uses the same SECURITY DEFINER RPC as getTenantMemberships (not the direct
// tenant_memberships table query). Filters for the target tenant + active=true
// client-side, then validates the row shape: active===true,
// tenant_id/user_id matching, known role + boolean can_clean. A malformed or
// mismatched row is denied (fail closed).
export async function verifyActiveTenantMembership(jwt: string, userId: string, tenantId: string) {
  const res = await serviceWrite<TenantMembership[]>(`rpc/repsuites_get_my_memberships`, jwt, {
    method: "POST",
    body: { p_user_id: userId },
  });

  if (res.error || !res.data || res.data.length === 0) {
    return {
      membership: null,
      authorized: false,
      error: res.error || "no_active_membership",
    };
  }

  // Find the membership for the target tenant among the returned rows.
  const row = res.data.find((m) => m.tenant_id === tenantId && m.active === true);

  // Validate the returned row: must be an object with active===true, and
  // tenant_id/user_id matching the current verified identity. A malformed or
  // mismatched row is treated as unauthorized (fail closed).
  if (
    !row ||
    typeof row !== "object" ||
    row.active !== true ||
    row.tenant_id !== tenantId ||
    row.user_id !== userId ||
    typeof row.role !== "string" ||
    typeof row.can_clean !== "boolean"
  ) {
    return { membership: null, authorized: false, error: "malformed_membership" };
  }

  return { membership: row, authorized: true, error: null };
}

export { getSupabaseConfig };
