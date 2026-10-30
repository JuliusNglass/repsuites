// Server-only: review requests (add, list, mark sent, stop), settings, the
// email sender run by the database every 10 minutes, and the tracked link.
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import {
  afterSend,
  DEFAULT_MESSAGE,
  DEFAULT_REMINDER,
  DEFAULT_SUBJECT,
  fillMessage,
  looksLikeEmail,
  type Channel,
} from "./review-requests";

const EDITORS = ["owner", "admin", "super_admin", "manager"];
const ORIGIN = "https://repsuites.com";

export interface RequestSettings {
  countryCode: string;
  firstDelayHours: number;
  reminderDays: number;
  maxReminders: number;
  message: string;
  reminderMessage: string;
  emailSubject: string;
}

export function linkFor(token: string): string {
  return `${ORIGIN}/q/${token}`;
}

function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function guard(write: boolean) {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: g.error || "Sign in again." };
  if (!EDITORS.includes(g.session.role || ""))
    return { ok: false as const, error: "Access denied." };
  if (write && !(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Please refresh the page and try again." };
  return {
    ok: true as const,
    tenantId: g.session.active_tenant_id!,
    userId: g.session.user_id,
    jwt: g.session.access_token,
  };
}

export async function settingsFor(tenantId: string): Promise<RequestSettings> {
  const r = await serviceRead<any[]>(
    `review_request_settings?select=*&tenant_id=eq.${tenantId}`,
    "",
  );
  const s = r.data?.[0];
  return {
    countryCode: s?.country_code ?? "44",
    firstDelayHours: s?.first_delay_hours ?? 2,
    reminderDays: s?.reminder_days ?? 3,
    maxReminders: s?.max_reminders ?? 1,
    message: s?.message || DEFAULT_MESSAGE,
    reminderMessage: s?.reminder_message || DEFAULT_REMINDER,
    emailSubject: s?.email_subject || DEFAULT_SUBJECT,
  };
}

async function businessName(tenantId: string): Promise<string> {
  const r = await serviceRead<{ name: string }[]>(`tenants?select=name&id=eq.${tenantId}`, "");
  return r.data?.[0]?.name ?? "us";
}

export async function readRequests() {
  const g = await guard(false);
  if (!g.ok) return g;
  const [settings, list, business] = await Promise.all([
    settingsFor(g.tenantId),
    serviceRead<any[]>(
      `review_requests?select=id,token,name,phone,email,channel,status,step,due_at,last_sent_at,opened_at,error,created_at&tenant_id=eq.${g.tenantId}&order=created_at.desc&limit=300`,
      "",
    ),
    businessName(g.tenantId),
  ]);
  return {
    ok: true as const,
    business,
    settings,
    requests: (list.data ?? []).map((r) => ({
      id: r.id as string,
      link: linkFor(r.token),
      name: (r.name ?? "") as string,
      phone: (r.phone ?? "") as string,
      email: (r.email ?? "") as string,
      channel: r.channel as Channel,
      status: r.status as string,
      step: r.step as number,
      dueAt: r.due_at as string,
      lastSentAt: r.last_sent_at as string | null,
      openedAt: r.opened_at as string | null,
      error: r.error as string | null,
      createdAt: r.created_at as string,
    })),
  };
}

export async function addRequests(input: {
  people: { name: string; phone: string | null; email: string | null; channel: Channel }[];
  sendNow: boolean;
}) {
  const g = await guard(true);
  if (!g.ok) return g;
  {
    const { featureBlockedFor } = await import("./tenant-access.server");
    const paid = await featureBlockedFor(g.jwt, g.tenantId, "growth");
    if (paid) return { ok: false as const, error: paid };
    const { emailUnconfirmed } = await import("./email-check.server");
    const unconfirmed = await emailUnconfirmed(g.userId);
    if (unconfirmed) return { ok: false as const, error: unconfirmed };
  }
  const s = await settingsFor(g.tenantId);
  const due = new Date(
    Date.now() + (input.sendNow ? 0 : s.firstDelayHours * 3600000),
  ).toISOString();
  const rows = input.people
    .filter((p) => (p.channel === "email" ? p.email && looksLikeEmail(p.email) : p.phone))
    .slice(0, 200)
    .map((p) => ({
      tenant_id: g.tenantId,
      token: newToken(),
      name: p.name.trim().slice(0, 80) || null,
      phone: p.phone?.trim().slice(0, 30) || null,
      email: p.email?.trim().toLowerCase().slice(0, 200) || null,
      channel: p.channel,
      status: "due",
      step: 0,
      due_at: due,
      created_by: g.userId,
    }));
  if (!rows.length)
    return { ok: false as const, error: "Add a phone number or email for each customer." };
  const w = await serviceWrite("review_requests", "", { method: "POST", body: rows });
  return w.error
    ? { ok: false as const, error: "Could not save. Try again." }
    : { ok: true as const, added: rows.length };
}

// After the business sends a WhatsApp or text from its own phone.
export async function markRequestSent(id: string) {
  const g = await guard(true);
  if (!g.ok) return g;
  const s = await settingsFor(g.tenantId);
  const r = await serviceRead<{ step: number; status: string }[]>(
    `review_requests?select=step,status&id=eq.${id}&tenant_id=eq.${g.tenantId}`,
    "",
  );
  const cur = r.data?.[0];
  if (!cur) return { ok: false as const, error: "Not found." };
  if (cur.status === "opened" || cur.status === "stopped") return { ok: true as const };
  const next = afterSend(cur.step, s.maxReminders, s.reminderDays, new Date());
  await serviceWrite(`review_requests?id=eq.${id}&tenant_id=eq.${g.tenantId}`, "", {
    method: "PATCH",
    body: {
      step: next.step,
      status: next.status,
      due_at: next.dueAt,
      last_sent_at: new Date().toISOString(),
      error: null,
    },
  });
  return { ok: true as const };
}

export async function stopRequest(id: string, remove: boolean) {
  const g = await guard(true);
  if (!g.ok) return g;
  const path = `review_requests?id=eq.${id}&tenant_id=eq.${g.tenantId}`;
  await serviceWrite(
    path,
    "",
    remove ? { method: "DELETE" } : { method: "PATCH", body: { status: "stopped" } },
  );
  return { ok: true as const };
}

export async function saveRequestSettings(s: RequestSettings) {
  const g = await guard(true);
  if (!g.ok) return g;
  const w = await serviceWrite("review_request_settings?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      tenant_id: g.tenantId,
      country_code: s.countryCode,
      first_delay_hours: s.firstDelayHours,
      reminder_days: s.reminderDays,
      max_reminders: s.maxReminders,
      message: s.message === DEFAULT_MESSAGE ? null : s.message,
      reminder_message: s.reminderMessage === DEFAULT_REMINDER ? null : s.reminderMessage,
      email_subject: s.emailSubject === DEFAULT_SUBJECT ? null : s.emailSubject,
      updated_by: g.userId,
      updated_at: new Date().toISOString(),
    },
  });
  return w.error ? { ok: false as const, error: "Could not save." } : { ok: true as const };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Called by the database every 10 minutes: emails every due email request.
export async function runEmailRequests(token: string) {
  const ok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
    method: "POST",
    body: { p_token: token },
  });
  if (ok.error || ok.data !== true) return { status: 401, body: { ok: false } };
  const due = await serviceRead<any[]>(
    `review_requests?select=id,tenant_id,token,name,email,step&channel=eq.email&status=in.(due,waiting)&due_at=lte.${new Date().toISOString()}&order=due_at.asc&limit=40`,
    "",
  );
  const { sendEmail } = await import("./email.server");
  const cache = new Map<string, { s: RequestSettings; business: string }>();
  let sent = 0;
  for (const r of due.data ?? []) {
    let c = cache.get(r.tenant_id);
    if (!c) {
      c = { s: await settingsFor(r.tenant_id), business: await businessName(r.tenant_id) };
      cache.set(r.tenant_id, c);
    }
    const vars = { name: r.name ?? "", business: c.business, link: linkFor(r.token) };
    const body = fillMessage(r.step === 0 ? c.s.message : c.s.reminderMessage, vars);
    const text = body.replace(vars.link, "").trim();
    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;max-width:520px;line-height:1.5">` +
      `<p>${esc(text)}</p>` +
      `<p><a href="${vars.link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Leave a quick review</a></p>` +
      `<p style="color:#6b7280;font-size:12px;margin-top:24px">You received this because you recently used ${esc(c.business)}. ` +
      `<a href="${vars.link}?stop=1" style="color:#6b7280">Do not send me reminders</a>.</p></div>`;
    const res = await sendEmail({
      to: r.email,
      subject: fillMessage(c.s.emailSubject, vars),
      html,
      text: `${body}\n\nTo stop reminders: ${vars.link}?stop=1`,
    });
    const now = new Date();
    if (res.ok) {
      const next = afterSend(r.step, c.s.maxReminders, c.s.reminderDays, now);
      await serviceWrite(`review_requests?id=eq.${r.id}`, "", {
        method: "PATCH",
        body: {
          step: next.step,
          status: next.status,
          due_at: next.dueAt,
          last_sent_at: now.toISOString(),
          error: null,
        },
      });
      sent++;
    } else {
      // Try again in an hour; give up after the email provider refuses for a day.
      await serviceWrite(`review_requests?id=eq.${r.id}`, "", {
        method: "PATCH",
        body: {
          error: res.error.slice(0, 200),
          due_at: new Date(now.getTime() + 3600000).toISOString(),
        },
      });
    }
  }
  return { status: 200, body: { ok: true, sent } };
}

// The tracked link a customer opens: records the open (which stops any
// reminders) and finds the business's review page.
export async function openRequest(
  token: string,
  stop: boolean,
  record = true,
): Promise<{ redirect: string } | { page: "stopped" | "missing" }> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return { page: "missing" };
  const r = await serviceRead<
    { id: string; tenant_id: string; status: string; opened_at: string | null }[]
  >(`review_requests?select=id,tenant_id,status,opened_at&token=eq.${token}`, "");
  const row = r.data?.[0];
  if (!row) return { page: "missing" };
  if (stop) {
    await serviceWrite(`review_requests?id=eq.${row.id}`, "", {
      method: "PATCH",
      body: { status: "stopped" },
    });
    return { page: "stopped" };
  }
  if (record && !row.opened_at)
    await serviceWrite(`review_requests?id=eq.${row.id}`, "", {
      method: "PATCH",
      body: {
        opened_at: new Date().toISOString(),
        ...(row.status === "stopped" ? {} : { status: "opened" }),
      },
    });
  const qr = await serviceRead<{ id: string; kind: string }[]>(
    `qr_links?select=id,kind&tenant_id=eq.${row.tenant_id}&active=eq.true&order=kind.asc,created_at.asc&limit=5`,
    "",
  );
  const pick = (qr.data ?? []).find((q) => q.kind === "business") ?? qr.data?.[0];
  if (pick) return { redirect: `${ORIGIN}/feedback/${pick.id}` };
  const links = await serviceRead<{ url: string }[]>(
    `review_links?select=url&tenant_id=eq.${row.tenant_id}&active=eq.true&order=position.asc&limit=1`,
    "",
  );
  const url = links.data?.[0]?.url;
  return url && url.startsWith("https://") ? { redirect: url } : { page: "missing" };
}
