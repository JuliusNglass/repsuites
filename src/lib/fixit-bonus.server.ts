// The Fix-It Pack bonus: a free month of RepSuites Growth, no card needed.
// claimFixitBonus runs at sign-up (/start?bonus=<pack key>). runBonusMonth
// runs with the daily lifecycle job: a reminder 7 days before the end, then
// back to the free plan at the end (unless they have started paying).
// No em dashes in this copy (AGENTS.md).
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { sendEmail } from "./email.server";
import { PLAN_FEATURES } from "./shop";

const DAY = 86_400_000;
export const BONUS_DAYS = 30;

export async function claimFixitBonus(viewKey: string, tenantId: string): Promise<boolean> {
  if (!/^[0-9a-f]{20,80}$/i.test(viewKey) || !/^[0-9a-f-]{36}$/i.test(tenantId)) return false;
  // Claim once: only an order with no bonus yet.
  const o = await serviceWrite<{ id: string }[]>(
    `fixit_orders?view_key=eq.${viewKey}&bonus_tenant_id=is.null`,
    "",
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { bonus_tenant_id: tenantId, bonus_claimed_at: new Date().toISOString() },
    },
  );
  const order = o.data?.[0];
  if (!order) return false;
  const ends = new Date(Date.now() + BONUS_DAYS * DAY).toISOString();
  const b = await serviceWrite("tenant_bonus?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: { tenant_id: tenantId, source: "fixit", fixit_order_id: order.id, ends_at: ends },
  });
  if (b.error) return false;
  await serviceWrite("tenant_plans?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: { tenant_id: tenantId, plan: "gold", features: PLAN_FEATURES.gold },
  });
  return true;
}

type Row = {
  tenant_id: string;
  ends_at: string;
  reminded_at: string | null;
  tenants: { name: string; settings: { owner_email?: string; owner_name?: string } | null } | null;
};

function email(first: string, body: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#0f172a;max-width:560px"><p>Hi ${first},</p>${body}<p>Any questions, just reply to this email.</p><p>The RepSuites team</p></div>`;
}

const button = (href: string, text: string) =>
  `<p style="margin:20px 0"><a href="${href}" style="background:#f5b324;color:#0f172a;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px;display:inline-block">${text}</a></p>`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function ownerEmail(tenantId: string): Promise<string | null> {
  const m = await serviceRead<{ user_id: string }[]>(
    `tenant_memberships?select=user_id&tenant_id=eq.${tenantId}&role=eq.owner&limit=1`,
    "",
  );
  const uid = m.data?.[0]?.user_id;
  if (!uid) return null;
  const { adminAuth } = await import("./signup.server");
  const r = await adminAuth(`users/${uid}`, "GET").catch(() => null);
  const u = (r?.data ?? null) as { email?: string } | null;
  return u?.email ?? null;
}

export async function runBonusMonth(
  now = new Date(),
): Promise<{ reminded: number; ended: number }> {
  const r = await serviceRead<Row[]>(
    `tenant_bonus?select=tenant_id,ends_at,reminded_at,tenants(name,settings)&ended_at=is.null&ends_at=lte.${new Date(now.getTime() + 7 * DAY).toISOString()}`,
    "",
  );
  let reminded = 0;
  let ended = 0;
  for (const b of r.data ?? []) {
    const name = esc(b.tenants?.name ?? "your business");
    const first = esc(String(b.tenants?.settings?.owner_name ?? "").split(/\s+/)[0] || "there");
    const to = await ownerEmail(b.tenant_id);
    const over = Date.parse(b.ends_at) <= now.getTime();
    if (!over && !b.reminded_at) {
      if (to)
        await sendEmail({
          to,
          replyTo: "support@repsuites.com",
          subject: `7 days left of your free RepSuites Growth month`,
          html: email(
            first,
            `<p>Your free month of RepSuites Growth for ${name} ends in 7 days.</p><p>To keep the AI review replies, review requests by text and your Google Maps tracking, it is £49 a month. That is about £1.61 a day: £49 x 12 = £588 a year, and £588 / 365 = £1.61.</p><p>If 3 extra customers a month each spend £20 with you, that is £60, more than it costs.</p>${button("https://repsuites.com/pricing", "Keep RepSuites Growth")}<p>If you do nothing, you go back to the free plan and keep your review page and QR code.</p>`,
          ),
        }).catch(() => null);
      await serviceWrite(`tenant_bonus?tenant_id=eq.${b.tenant_id}`, "", {
        method: "PATCH",
        body: { reminded_at: now.toISOString() },
      });
      reminded++;
      continue;
    }
    if (!over) continue;
    // Paying now? Leave their plan alone.
    const bill = await serviceRead<{ status: string | null }[]>(
      `tenant_billing?select=status&tenant_id=eq.${b.tenant_id}`,
      "",
    );
    const paying = ["active", "trialing", "past_due"].includes(
      String(bill.data?.[0]?.status ?? ""),
    );
    if (!paying) {
      await serviceWrite("tenant_plans?on_conflict=tenant_id", "", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: { tenant_id: b.tenant_id, plan: "free", features: [] },
      });
      if (to)
        await sendEmail({
          to,
          replyTo: "support@repsuites.com",
          subject: `Your free RepSuites Growth month has ended`,
          html: email(
            first,
            `<p>Your free month of RepSuites Growth for ${name} has ended, so you are on the free plan now. Your review page and QR code still work.</p><p>Want the AI replies and review requests back? It is £49 a month, about £1.61 a day, with a 14-day free trial.</p>${button("https://repsuites.com/pricing", "Turn Growth back on")}`,
          ),
        }).catch(() => null);
    }
    await serviceWrite(`tenant_bonus?tenant_id=eq.${b.tenant_id}`, "", {
      method: "PATCH",
      body: { ended_at: now.toISOString() },
    });
    ended++;
  }
  return { reminded, ended };
}
