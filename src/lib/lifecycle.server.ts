// Server-only: the daily follow-up run, the weekly digest for Julius, the
// dashboard "last seen" mark and one-click unsubscribe.
//
// Safety: lifecycle_settings.mode starts as 'preview'. In preview nobody but
// Julius gets an email: he gets a daily list of what WOULD be sent, with the
// full text. Switch to 'live' only after approving the wording.
// No em dashes in this copy (AGENTS.md).
import { sendEmail } from "./email.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import {
  emailFor,
  isPaying,
  nextEmail,
  quietDays,
  type EmailType,
  type Facts,
  type Sent,
} from "./lifecycle";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const ORIGIN = "https://repsuites.com";

function julius(): string {
  return (process.env["REPSUITES_LEADS_TO"] ?? "").trim() || "julius@accelur8.com";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Dashboard load: mark the business as active (the database does at most one
// write an hour, and ignores the Accelur8 team).
export async function touchActivity(tenantId: string, userId: string) {
  if (!UUID_RE.test(tenantId) || !UUID_RE.test(userId)) return;
  await serviceWrite("rpc/repsuites_touch_activity", "", {
    method: "POST",
    body: { p_tenant: tenantId, p_user: userId },
  }).catch(() => null);
}

const num = (v: unknown) => Number(v ?? 0) || 0;

async function loadFacts(): Promise<Facts[]> {
  const r = await serviceWrite<Record<string, unknown>[]>("rpc/repsuites_lifecycle_facts", "", {
    method: "POST",
    body: {},
  });
  return (r.data ?? []).map((x) => ({
    tenant_id: String(x["tenant_id"]),
    name: String(x["name"] ?? "Your business"),
    created_at: String(x["created_at"]),
    plan: String(x["plan"] ?? "free"),
    billing_status: (x["billing_status"] as string | null) ?? null,
    legacy: !!x["legacy"],
    self_serve: !!x["self_serve"],
    owner_email: (x["owner_email"] as string | null) ?? null,
    owner_name: (x["owner_name"] as string | null) ?? null,
    email_confirmed: !!x["email_confirmed"],
    last_seen_at: (x["last_seen_at"] as string | null) ?? null,
    unsubscribed: !!x["unsubscribed"],
    unsub_token: (x["unsub_token"] as string | null) ?? null,
    google_connected: !!x["google_connected"],
    scans_total: num(x["scans_total"]),
    scans_7d: num(x["scans_7d"]),
    feedback_total: num(x["feedback_total"]),
    feedback_7d: num(x["feedback_7d"]),
    requests_sent: num(x["requests_sent"]),
    replies_total: num(x["replies_total"]),
    orders_paid: num(x["orders_paid"]),
  }));
}

// Every business needs a tenant_activity row so it has an unsubscribe token.
async function ensureToken(f: Facts): Promise<string | null> {
  if (f.unsub_token) return f.unsub_token;
  const r = await serviceWrite<{ unsub_token: string }[]>(
    "tenant_activity?on_conflict=tenant_id",
    "",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: { tenant_id: f.tenant_id },
    },
  );
  return r.data?.[0]?.unsub_token ?? null;
}

export async function runLifecycle(token: string) {
  const ok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
    method: "POST",
    body: { p_token: token },
  });
  if (ok.error || ok.data !== true) return { status: 401, body: { ok: false } };

  const now = new Date();
  const [settings, facts, sends] = await Promise.all([
    serviceRead<{ mode: string; last_weekly_at: string | null; last_daily_at: string | null }[]>(
      "lifecycle_settings?select=mode,last_weekly_at,last_daily_at&id=eq.true",
      "",
    ),
    loadFacts(),
    serviceRead<{ tenant_id: string; type: string; sent_at: string }[]>(
      `lifecycle_sends?select=tenant_id,type,sent_at&mode=eq.live&sent_at=gte.${new Date(now.getTime() - 120 * 86_400_000).toISOString()}`,
      "",
    ),
  ]);
  const s = settings.data?.[0];
  // Once a day only, even if the job is run twice.
  if (s?.last_daily_at && now.getTime() - Date.parse(s.last_daily_at) < 20 * 3_600_000)
    return { status: 200, body: { ok: true, skipped: "already ran today" } };
  await serviceWrite("lifecycle_settings?id=eq.true", "", {
    method: "PATCH",
    body: { last_daily_at: now.toISOString() },
  });
  const live = s?.mode === "live";

  const byTenant = new Map<string, Sent[]>();
  for (const x of sends.data ?? []) {
    const list = byTenant.get(x.tenant_id) ?? [];
    list.push({ type: x.type, sent_at: x.sent_at });
    byTenant.set(x.tenant_id, list);
  }

  const due: { f: Facts; type: EmailType; subject: string; html: string }[] = [];
  for (const f of facts) {
    const type = nextEmail(f, byTenant.get(f.tenant_id) ?? [], now);
    if (!type) continue;
    const tok = await ensureToken(f);
    if (!tok) continue;
    const e = emailFor(type, f, `${ORIGIN}/api/unsubscribe?t=${tok}`);
    due.push({ f, type, ...e });
    if (due.length >= 40) break; // a quiet, steady pace
  }

  let sent = 0;
  if (live) {
    for (const d of due) {
      const r = await sendEmail({
        to: d.f.owner_email!,
        replyTo: "support@repsuites.com",
        subject: d.subject,
        html: d.html,
      });
      if (!r.ok) continue;
      sent++;
      await serviceWrite("lifecycle_sends", "", {
        method: "POST",
        body: { tenant_id: d.f.tenant_id, type: d.type, mode: "live", to_email: d.f.owner_email },
      });
    }
  } else if (due.length) {
    // Preview: one email to Julius with everything that would have gone out.
    const parts = due
      .map(
        (d) =>
          `<hr><p><b>${esc(d.f.name)}</b> (${esc(d.f.owner_email ?? "")}), email: <b>${d.type}</b><br>Subject: ${esc(d.subject)}</p><div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px">${d.html}</div>`,
      )
      .join("");
    await sendEmail({
      to: julius(),
      subject: `RepSuites follow-ups (preview): ${due.length} would be sent today`,
      html: `<p>Preview mode: nothing was sent to customers. These would have gone out today:</p>${parts}<p>Happy with the wording? Ask Claude to switch follow-ups to live.</p>`,
    });
    await serviceWrite("lifecycle_sends", "", {
      method: "POST",
      body: due.map((d) => ({
        tenant_id: d.f.tenant_id,
        type: d.type,
        mode: "preview",
        to_email: d.f.owner_email,
      })),
    });
  }

  // Mondays: the weekly digest for Julius.
  let weekly = false;
  if (
    now.getUTCDay() === 1 &&
    (!s?.last_weekly_at || now.getTime() - Date.parse(s.last_weekly_at) > 6 * 86_400_000)
  ) {
    weekly = await weeklyDigest(facts, now);
    if (weekly)
      await serviceWrite("lifecycle_settings?id=eq.true", "", {
        method: "PATCH",
        body: { last_weekly_at: now.toISOString() },
      });
  }
  return {
    status: 200,
    body: { ok: true, mode: live ? "live" : "preview", due: due.length, sent, weekly },
  };
}

// Who needs Julius this week: at risk, hot leads, new sign-ups, new payers.
export function weeklyLists(facts: Facts[], now: Date) {
  const real = facts.filter((f) => !/test/i.test(f.name) && (f.self_serve || isPaying(f)));
  const weekAgo = now.getTime() - 7 * 86_400_000;
  return {
    atRisk: real.filter(
      (f) => isPaying(f) && (f.billing_status === "past_due" || quietDays(f, now) >= 14),
    ),
    hot: real.filter(
      (f) => f.plan === "free" && (f.scans_7d >= 5 || f.feedback_7d >= 1 || f.requests_sent > 0),
    ),
    newSignups: real.filter((f) => f.self_serve && Date.parse(f.created_at) >= weekAgo),
    paying: real.filter((f) => isPaying(f)),
  };
}

async function weeklyDigest(facts: Facts[], now: Date): Promise<boolean> {
  const l = weeklyLists(facts, now);
  const conv = await serviceRead<{ received_at: string }[]>(
    `stripe_events?select=received_at&type=eq.customer.subscription.created&received_at=gte.${new Date(now.getTime() - 7 * 86_400_000).toISOString()}`,
    "",
  );
  const row = (f: Facts, why: string) =>
    `<li><b>${esc(f.name)}</b> (${esc(f.owner_email ?? "no email")}): ${esc(why)}</li>`;
  const list = (items: string[]) =>
    items.length ? `<ul>${items.join("")}</ul>` : '<p style="color:#64748b">None this week.</p>';
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;max-width:620px">
<h2 style="margin:0 0 8px">RepSuites this week</h2>
<p>${l.newSignups.length} new free sign-ups, ${conv.data?.length ?? 0} new paid plans, ${l.paying.length} paying in total.</p>
<h3>At risk (call them)</h3>${list(
    l.atRisk.map((f) =>
      row(
        f,
        f.billing_status === "past_due"
          ? "payment failed"
          : `not opened RepSuites for ${Math.floor(quietDays(f, now))} days`,
      ),
    ),
  )}
<h3>Hot leads on the free plan (offer Growth)</h3>${list(
    l.hot.map((f) =>
      row(
        f,
        `${f.scans_7d} scans and ${f.feedback_7d} private messages this week, ${f.requests_sent} review requests sent`,
      ),
    ),
  )}
<h3>New sign-ups</h3>${list(
    l.newSignups.map((f) =>
      row(
        f,
        `${f.google_connected ? "Google connected" : "Google not connected"}, ${f.scans_total} scans`,
      ),
    ),
  )}
</div>`;
  const r = await sendEmail({ to: julius(), subject: "RepSuites weekly: who to call", html });
  return r.ok;
}

// One-click unsubscribe (the page asks once, so link scanners cannot do it).
export async function unsubscribe(token: string): Promise<boolean> {
  if (!UUID_RE.test(token)) return false;
  const r = await serviceWrite<{ tenant_id: string }[]>(
    `tenant_activity?unsub_token=eq.${token}`,
    "",
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { unsubscribed_at: new Date().toISOString() },
    },
  );
  return !!r.data?.length;
}
