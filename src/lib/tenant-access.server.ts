// Server-only: read a business's plan and payment status, and decide whether
// the current request may change anything.
import { getRequest } from "@tanstack/react-start/server";
import { supabaseRest } from "./supabase.server";
import { serviceWrite, hasServiceRole } from "./supabase-service.server";
import {
  blockedMessage,
  changesBlocked,
  fullAccess,
  hasFeature,
  notInPlanMessage,
  parseTenantAccess,
  type AccessAudience,
  type Feature,
  type TenantAccess,
} from "./plan-access";

export async function readTenantAccess(jwt: string, tenantId: string): Promise<TenantAccess> {
  const body = { p_tenant: tenantId };
  try {
    if (jwt) {
      const r = await supabaseRest<unknown>("rpc/repsuites_tenant_access", {
        method: "POST",
        jwt,
        body,
      });
      if (!r.error && r.data) return parseTenantAccess(r.data, tenantId);
    }
    // The caller already verified the session; the service role path keeps
    // this working if the user token cannot be checked by the database.
    if (hasServiceRole()) {
      const s = await serviceWrite<unknown>("rpc/repsuites_tenant_access", "", {
        method: "POST",
        body,
      });
      if (!s.error && s.data) {
        const access = parseTenantAccess(s.data, tenantId);
        // The service path cannot know who is asking, so never grant agency.
        return { ...access, agency: false };
      }
    }
  } catch {
    // fall through
  }
  console.warn("[tenant-access] status unavailable, allowing full access", tenantId);
  return fullAccess(tenantId);
}

// Server functions that change data are POST; reads are GET. Outside a
// request (tests, scripts) nothing counts as a change.
export function isChangeRequest(): boolean {
  try {
    return getRequest()?.method?.toUpperCase() === "POST";
  } catch {
    return false;
  }
}

// Returns a message when the current request must be refused, otherwise null.
export async function changeBlockedFor(
  jwt: string,
  tenantId: string | undefined,
  who: AccessAudience,
): Promise<string | null> {
  if (!tenantId || !isChangeRequest()) return null;
  const access = await readTenantAccess(jwt, tenantId);
  return changesBlocked(access, who) ? blockedMessage(access, who) : null;
}

// Returns a message when the business's plan does not include the feature.
export async function featureBlockedFor(
  jwt: string,
  tenantId: string,
  feature: Feature,
): Promise<string | null> {
  const access = await readTenantAccess(jwt, tenantId);
  return hasFeature(access, feature) ? null : notInPlanMessage(feature);
}

// Public pages (apply form, hiring banner) have no signed-in user.
export async function tenantHasFeatureService(
  tenantId: string,
  feature: Feature,
): Promise<boolean> {
  const access = await readTenantAccess("", tenantId);
  return hasFeature(access, feature);
}
