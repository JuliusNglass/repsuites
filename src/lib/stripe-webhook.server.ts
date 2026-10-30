// Server-only: handles Stripe events. Paid shop orders are marked paid and
// emailed to Accelur8 and the customer; plan subscriptions set the business's
// plan and features. No em dashes in this copy (AGENTS.md).
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { stripe, verifyStripeSignature } from "./stripe.server";
import { sendEmail } from "./email.server";
import { money, PLAN_FEATURES, type PaidPlan } from "./shop";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const PLANS: PaidPlan[] = ["starter", "pro", "gold"];

async function setPlan(tenantId: string, plan: PaidPlan | "free") {
  await serviceWrite("tenant_plans?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: { tenant_id: tenantId, plan, features: plan === "free" ? [] : PLAN_FEATURES[plan] },
  });
}

async function saveSubscription(sub: any) {
  const tenantId = String(sub?.metadata?.tenant_id ?? "");
  const plan = String(sub?.metadata?.plan ?? "") as PaidPlan;
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !PLANS.includes(plan)) return;
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  await serviceWrite("tenant_billing?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      tenant_id: tenantId,
      stripe_customer_id: String(sub.customer ?? "") || null,
      stripe_subscription_id: String(sub.id ?? "") || null,
      plan,
      status: String(sub.status ?? ""),
      current_period_end: end ? new Date(Number(end) * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
  });
  const live = ["active", "trialing", "past_due"].includes(String(sub.status));
  await setPlan(tenantId, live ? plan : "free");
}

async function shopPaid(session: any) {
  const orderId = String(session?.metadata?.order_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return;
  const ship = session.collected_information?.shipping_details ?? session.shipping_details ?? null;
  const cust = session.customer_details ?? {};
  await serviceWrite(`shop_orders?id=eq.${orderId}&status=eq.pending`, "", {
    method: "PATCH",
    body: {
      status: "paid",
      paid_at: new Date().toISOString(),
      email: cust.email ?? null,
      contact_name: ship?.name ?? cust.name ?? null,
      phone: cust.phone ?? null,
      shipping: ship ?? cust.address ?? null,
      stripe_payment_intent: String(session.payment_intent ?? "") || null,
      updated_at: new Date().toISOString(),
    },
  });
  const r = await serviceRead<any[]>(`shop_orders?select=*&id=eq.${orderId}`, "");
  const o = r.data?.[0];
  if (!o) return;
  const items = (o.items as { kind: string; qty: number; pence: number }[])
    .map((i) => `${i.qty} x ${i.kind === "cards" ? "NFC card" : "A5 stand"} (${money(i.pence)})`)
    .join(", ");
  const a = o.shipping?.address ?? {};
  const address = [o.contact_name, a.line1, a.line2, a.city, a.postal_code]
    .filter(Boolean)
    .join(", ");
  const to = (process.env["REPSUITES_LEADS_TO"] ?? "").trim() || "julius@accelur8.com";
  await sendEmail({
    to,
    subject: `New card order: ${o.business_name} (${money(o.total_pence)})`,
    html: `<p><b>${esc(o.business_name)}</b> paid ${money(o.total_pence)}.</p>
<p>${esc(items)}</p>
<p>Message on the card: ${esc(o.card_message || "(default)")}</p>
<p>Review link: ${o.review_url ? `<a href="${esc(o.review_url)}">${esc(o.review_url)}</a>` : "not chosen, contact the customer"}</p>
<p>Deliver to: ${esc(address)}<br>Email: ${esc(o.email ?? "")}<br>Phone: ${esc(o.phone ?? "")}</p>
<p>Order ${o.id}</p>`,
  }).catch(() => null);
  if (o.email)
    await sendEmail({
      to: o.email,
      replyTo: "support@repsuites.com",
      subject: `Your RepSuites order for ${o.business_name}`,
      html: `<p>Hi${o.contact_name ? ` ${esc(String(o.contact_name).split(" ")[0] ?? "")}` : ""},</p>
<p>Thank you. Your order is in: ${esc(items)}.</p>
<p>What happens next:</p>
<ol><li>We set up your cards to open your review page, and check the link works.</li>
<li>We print and post them to ${esc(address || "the address you gave")}.</li>
<li>When they arrive, tap one on your phone to try it. Then put them where customers pay.</li></ol>
<p>Questions? Just reply to this email.</p><p>RepSuites</p>`,
    }).catch(() => null);
}

export async function handleStripeWebhook(raw: string, sig: string | null) {
  if (!(await verifyStripeSignature(raw, sig))) return 400;
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return 400;
  }
  // Each event is handled once even if Stripe sends it again.
  const seen = await serviceWrite<{ id: string }[]>("stripe_events?on_conflict=id", "", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: { id: String(event.id), type: String(event.type) },
  });
  if (!seen.error && (seen.data?.length ?? 0) === 0) return 200;

  const obj = event.data?.object ?? {};
  switch (event.type) {
    case "checkout.session.completed":
      if (obj.metadata?.kind === "shop" && obj.payment_status === "paid") await shopPaid(obj);
      if (obj.metadata?.kind === "plan" && obj.subscription) {
        const sub = await stripe(`subscriptions/${obj.subscription}`);
        if (sub.ok) await saveSubscription(sub.data);
      }
      break;
    case "checkout.session.async_payment_succeeded":
      if (obj.metadata?.kind === "shop") await shopPaid(obj);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await saveSubscription(obj);
      break;
  }
  return 200;
}
