/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase/Stripe JSON is checked field by field. */
// Server-only: when a £27 funnel buyer picks a plan, set up their RepSuites
// account straight away: the business (tenant) on the chosen plan, its QR code
// and review link, the owner login (an email to choose a password), and the
// Stripe subscription tagged with the tenant so the webhook keeps the plan in
// step from then on. Safe to call twice: it reuses the tenant already made.
// No em dashes in customer copy (AGENTS.md).
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { stripe } from "./stripe.server";
import { PLAN_FEATURES } from "./shop";
import { reviewUrl } from "./signup";
import type { FixitOrder } from "./fixit-pack.server";

type PlanKey = "managed" | "gold";

export async function provisionPlanAccount(
  o: FixitOrder,
  plan: PlanKey,
  subId: string | null,
): Promise<{ ok: boolean; status?: string; note?: string }> {
  if (!o.email) return { ok: false, note: "No email on the order." };
  const business = String(o.business ?? "Your business").slice(0, 120);

  // Reuse the tenant if this order already made one.
  const prior = await serviceRead<{ id: string }[]>(
    `tenants?select=id&settings->>fixit_order=eq.${o.id}&limit=1`,
    "",
  );
  let tenantId = prior.data?.[0]?.id ?? "";
  if (!tenantId) {
    let placeId = "";
    if (o.report_token) {
      const p = await serviceRead<{ place_id: string | null }[]>(
        `prospects?select=place_id&report_token=eq.${o.report_token}&limit=1`,
        "",
      );
      placeId = String(p.data?.[0]?.place_id ?? "");
    }
    const t = await serviceWrite<{ id: string }[]>("tenants", "", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        name: business,
        settings: {
          source: "funnel27",
          fixit_order: o.id,
          owner_name: o.name ?? "",
          ...(placeId ? { place_id: placeId } : {}),
        },
      },
    });
    tenantId = t.data?.[0]?.id ?? "";
    if (!tenantId) return { ok: false, note: "Could not create the business." };
    await serviceWrite("qr_links", "", {
      method: "POST",
      body: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        kind: "business",
        active: true,
        business_name: business,
        google_place_id: placeId || null,
        target_url: placeId ? reviewUrl(placeId) : null,
      },
    }).catch(() => null);
  }

  await serviceWrite("tenant_plans?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: { tenant_id: tenantId, plan, features: PLAN_FEATURES[plan] },
  });
  if (subId) {
    await serviceWrite("tenant_billing?on_conflict=tenant_id", "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: {
        tenant_id: tenantId,
        stripe_customer_id: o.stripe_customer ?? null,
        stripe_subscription_id: subId,
        plan,
        status: "trialing",
        updated_at: new Date().toISOString(),
      },
    }).catch(() => null);
    // From now on the normal webhook keeps this plan in step (stripe-webhook.server.ts).
    await stripe(`subscriptions/${subId}`, {
      metadata: { kind: "plan", product: "repsuites", tenant_id: tenantId, plan },
    }).catch(() => null);
  }

  const { giveOwner } = await import("./add-business.server");
  const owner = await giveOwner(tenantId, business, o.email, String(o.name ?? ""));
  return { ok: owner.status !== "failed", status: owner.status, note: (owner as any).note };
}
