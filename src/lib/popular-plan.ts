// "Most popular" on the prices page must be true. Client-safe and pure: the
// server counts active paying subscriptions per plan (no customer data leaves
// the database) and this rule decides which plan, if any, gets the badge.
// No em dashes in this copy (AGENTS.md).

import type { CheckoutPlan } from "./shop";

export type PlanCount = { plan: string; subscriptions: number };

// Fewer paying customers than this and "most popular" means nothing.
export const POPULAR_MIN_PAID = 5;

// Plans that have a card on the prices page and so can show the badge.
export const BADGE_PLANS: readonly CheckoutPlan[] = ["gold", "managed"];

// The plan with the most active paying subscriptions, only when there are at
// least POPULAR_MIN_PAID in total and it has strictly more than every other
// plan (older plan ids count too). A tie, too few, or a leader that is not on
// the prices page any more: no badge.
export function pickPopularPlan(rows: readonly PlanCount[]): CheckoutPlan | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const n = Number(r?.subscriptions);
    if (!r || typeof r.plan !== "string" || !r.plan || !Number.isFinite(n) || n <= 0) continue;
    counts.set(r.plan, (counts.get(r.plan) ?? 0) + Math.floor(n));
  }
  let total = 0;
  for (const n of counts.values()) total += n;
  if (total < POPULAR_MIN_PAID) return null;

  let leader: string | null = null;
  let best = 0;
  let tied = false;
  for (const [plan, n] of counts) {
    if (n > best) {
      leader = plan;
      best = n;
      tied = false;
    } else if (n === best) tied = true;
  }
  if (tied || !leader) return null;
  return (BADGE_PLANS as readonly string[]).includes(leader) ? (leader as CheckoutPlan) : null;
}
