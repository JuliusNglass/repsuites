// Server-only: which plan may say "Most popular". The database function
// repsuites_paid_plan_counts (service_role only) returns a count per plan and
// nothing else, so no customer row ever reaches the app or the browser.
// Cached in memory for 10 minutes; if the count cannot be read, no badge.
import { serviceWrite } from "./supabase-service.server";
import { pickPopularPlan, type PlanCount } from "./popular-plan";
import type { CheckoutPlan } from "./shop";

const TTL_MS = 10 * 60_000;
const RETRY_MS = 60_000;

let cache: { at: number; ttl: number; plan: CheckoutPlan | null } | null = null;

export function resetPopularPlanCache() {
  cache = null;
}

export async function popularPlan(now = Date.now()): Promise<CheckoutPlan | null> {
  if (cache && now - cache.at < cache.ttl) return cache.plan;
  try {
    const r = await serviceWrite<PlanCount[]>("rpc/repsuites_paid_plan_counts", "", {
      method: "POST",
      body: {},
    });
    if (r.error || !Array.isArray(r.data)) {
      cache = { at: now, ttl: RETRY_MS, plan: null };
      return null;
    }
    const plan = pickPopularPlan(r.data);
    cache = { at: now, ttl: TTL_MS, plan };
    return plan;
  } catch {
    cache = { at: now, ttl: RETRY_MS, plan: null };
    return null;
  }
}
