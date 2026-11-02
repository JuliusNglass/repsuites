/* eslint-disable @typescript-eslint/no-explicit-any -- database rows are checked field by field. */
// Server-only: "Ask past customers" campaigns. A checked list trickles into
// the same review request queue as the Ask tab (queueRequests), so the
// "don't ask again" window, quiet hours, opt-outs, reminders and the
// unsubscribe link all apply. Phone-only customers land in Ready to send.
// Stops itself on too many bounces or unsubscribes in a day. No em dashes.
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import type { Budget } from "./accounting";
import {
  CAMPAIGN_MAX,
  campaignQuota,
  campaignStopReason,
  clampRate,
  classifyContacts,
  progressOf,
  type Contact,
} from "./campaigns";
import { emailKey, outOfQuietHours } from "./review-requests";
import { businessName, queueRequests, settingsFor, timezoneFor } from "./review-requests.server";

const EDITORS = ["owner", "admin", "super_admin", "manager"];
const DAY = 86400000;

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

async function classify(tenantId: string, contacts: Contact[]) {
  const s = await settingsFor(tenantId);
  const now = new Date();
  const since = new Date(now.getTime() - s.cooldownDays * DAY).toISOString();
  const [pastR, outR] = await Promise.all([
    serviceRead<any[]>(
      `review_requests?select=email,phone_key,status,created_at&tenant_id=eq.${tenantId}&created_at=gte.${since}&status=neq.skipped&limit=10000`,
      "",
    ),
    serviceRead<{ contact: string }[]>(
      `review_request_optouts?select=contact&tenant_id=eq.${tenantId}&limit=10000`,
      "",
    ),
  ]);
  return classifyContacts(contacts, {
    countryCode: s.countryCode,
    cooldownDays: s.cooldownDays,
    past: pastR.data ?? [],
    optedOut: new Set((outR.data ?? []).map((o) => o.contact)),
    now,
  });
}

export async function previewCampaign(contacts: Contact[]) {
  const g = await guard(false);
  if (!g.ok) return g;
  const r = await classify(g.tenantId, contacts);
  return {
    ok: true as const,
    counts: r.counts,
    cooldownDays: (await settingsFor(g.tenantId)).cooldownDays,
  };
}

export async function readCampaigns() {
  const g = await guard(false);
  if (!g.ok) return g;
  const [list, business] = await Promise.all([
    serviceRead<any[]>(
      `review_campaigns?select=id,status,daily_rate,message,email_subject,total,stop_reason,created_at&tenant_id=eq.${g.tenantId}&order=created_at.desc&limit=5`,
      "",
    ),
    businessName(g.tenantId),
  ]);
  const latest = list.data?.[0] ?? null;
  let progress = null;
  if (latest) {
    const [rows, waiting] = await Promise.all([
      serviceRead<any[]>(
        `review_requests?select=status,first_sent_at,clicked_at,reviewed_at&tenant_id=eq.${g.tenantId}&campaign_id=eq.${latest.id}&limit=${CAMPAIGN_MAX}`,
        "",
      ),
      serviceRead<{ id: number }[]>(
        `review_campaign_contacts?select=id&campaign_id=eq.${latest.id}&tenant_id=eq.${g.tenantId}&status=eq.waiting&limit=${CAMPAIGN_MAX}`,
        "",
      ),
    ]);
    progress = progressOf(Number(latest.total ?? 0), waiting.data?.length ?? 0, rows.data ?? []);
  }
  return {
    ok: true as const,
    business,
    campaign: latest
      ? {
          id: String(latest.id),
          status: String(latest.status) as "running" | "paused" | "stopped" | "finished",
          dailyRate: Number(latest.daily_rate),
          message: String(latest.message),
          emailSubject: String(latest.email_subject),
          total: Number(latest.total),
          stopReason: (latest.stop_reason as string | null) ?? null,
          createdAt: String(latest.created_at),
        }
      : null,
    progress,
  };
}

export async function startCampaign(input: {
  contacts: Contact[];
  dailyRate: number;
  message: string;
  emailSubject: string;
  lawfulBasis: boolean;
}) {
  const g = await guard(true);
  if (!g.ok) return g;
  if (!input.lawfulBasis)
    return {
      ok: false as const,
      error: "Tick the box to confirm these are your past customers and you may contact them.",
    };
  {
    const { featureBlockedFor } = await import("./tenant-access.server");
    const paid = await featureBlockedFor(g.jwt, g.tenantId, "growth");
    if (paid) return { ok: false as const, error: paid };
    const { emailUnconfirmed } = await import("./email-check.server");
    const unconfirmed = await emailUnconfirmed(g.userId);
    if (unconfirmed) return { ok: false as const, error: unconfirmed };
  }
  const open = await serviceRead<{ id: string }[]>(
    `review_campaigns?select=id&tenant_id=eq.${g.tenantId}&status=in.(running,paused)&limit=1`,
    "",
  );
  if (open.data?.length)
    return { ok: false as const, error: "Stop the current campaign before starting a new one." };
  const { ready } = await classify(g.tenantId, input.contacts);
  if (!ready.length)
    return { ok: false as const, error: "Nobody on this list can be asked right now." };
  const now = new Date().toISOString();
  const c = await serviceWrite<{ id: string }[]>("review_campaigns", "", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      tenant_id: g.tenantId,
      status: "running",
      daily_rate: clampRate(input.dailyRate),
      message: input.message.replace(/—|–/g, "-").slice(0, 600),
      email_subject: input.emailSubject.replace(/—|–/g, "-").slice(0, 150),
      total: ready.length,
      lawful_basis_confirmed_at: now,
      created_by: g.userId,
    },
  });
  const id = c.data?.[0]?.id;
  if (c.error || !id) return { ok: false as const, error: "Could not start. Try again." };
  for (let i = 0; i < ready.length; i += 500) {
    const w = await serviceWrite("review_campaign_contacts", "", {
      method: "POST",
      body: ready.slice(i, i + 500).map((p) => ({
        campaign_id: id,
        tenant_id: g.tenantId,
        name: p.name || null,
        email: p.email,
        phone: p.phone,
        last_job_date: p.lastJobDate,
      })),
    });
    if (w.error) {
      await serviceWrite(`review_campaigns?id=eq.${id}&tenant_id=eq.${g.tenantId}`, "", {
        method: "DELETE",
      });
      return { ok: false as const, error: "Could not save the list. Try again." };
    }
  }
  return { ok: true as const, id, total: ready.length };
}

export async function updateCampaign(input: {
  id: string;
  status?: "running" | "paused" | "stopped" | undefined;
  dailyRate?: number | undefined;
}) {
  const g = await guard(true);
  if (!g.ok) return g;
  const cur = await serviceRead<{ status: string }[]>(
    `review_campaigns?select=status&id=eq.${input.id}&tenant_id=eq.${g.tenantId}`,
    "",
  );
  const status = cur.data?.[0]?.status;
  if (!status) return { ok: false as const, error: "Not found." };
  if (status === "stopped" || status === "finished")
    return { ok: false as const, error: "This campaign has ended. Start a new one." };
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status) {
    body["status"] = input.status;
    if (input.status === "running") body["stop_reason"] = null;
    if (input.status === "stopped") body["stop_reason"] = "Stopped by you.";
  }
  if (input.dailyRate !== undefined) body["daily_rate"] = clampRate(input.dailyRate);
  const w = await serviceWrite(
    `review_campaigns?id=eq.${input.id}&tenant_id=eq.${g.tenantId}`,
    "",
    {
      method: "PATCH",
      body,
    },
  );
  if (w.error) return { ok: false as const, error: "Could not save." };
  if (input.status === "stopped") {
    // Asks already queued but not sent yet are stopped too.
    await serviceWrite(
      `review_requests?tenant_id=eq.${g.tenantId}&campaign_id=eq.${input.id}&status=eq.due&step=eq.0&last_sent_at=is.null`,
      "",
      { method: "PATCH", body: { status: "stopped" } },
    );
  }
  return { ok: true as const };
}

function localHour(d: Date, tz: string): number {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .find((p) => p.type === "hour")?.value;
    return Number(h) % 24;
  } catch {
    return d.getUTCHours();
  }
}

// One campaign's turn in the scheduled run. About 12 database calls.
async function tickCampaign(
  c: { id: string; tenant_id: string; daily_rate: number; message: string; email_subject: string },
  budget: Budget,
): Promise<number> {
  const now = new Date();
  const since = new Date(now.getTime() - DAY).toISOString();
  const hourAgo = now.getTime() - 3600000;
  const stopWith = async (reason: string, status: "stopped" | "finished") => {
    budget.take(1);
    await serviceWrite(`review_campaigns?id=eq.${c.id}&tenant_id=eq.${c.tenant_id}`, "", {
      method: "PATCH",
      body: { status, stop_reason: reason, updated_at: now.toISOString() },
    });
  };

  // 1. Health over the last 24 hours.
  budget.take(1);
  const recent = await serviceRead<any[]>(
    `review_requests?select=first_sent_at,bounced_at,unsubscribed_at&tenant_id=eq.${c.tenant_id}&campaign_id=eq.${c.id}&or=(first_sent_at.gte."${since}",bounced_at.gte."${since}",unsubscribed_at.gte."${since}")&limit=${CAMPAIGN_MAX}`,
    "",
  );
  const rows = recent.data ?? [];
  const reason = campaignStopReason({
    sent: rows.filter((r) => r.first_sent_at && r.first_sent_at >= since).length,
    bounced: rows.filter((r) => r.bounced_at && r.bounced_at >= since).length,
    unsubscribed: rows.filter((r) => r.unsubscribed_at && r.unsubscribed_at >= since).length,
  });
  if (reason) {
    await stopWith(reason, "stopped");
    budget.take(1);
    await serviceWrite(
      `review_requests?tenant_id=eq.${c.tenant_id}&campaign_id=eq.${c.id}&status=eq.due&step=eq.0&last_sent_at=is.null`,
      "",
      { method: "PATCH", body: { status: "stopped" } },
    );
    return 0;
  }

  // 2. How many went out recently, and how many may go now.
  budget.take(3);
  const [queued, s, tz] = await Promise.all([
    serviceRead<{ queued_at: string }[]>(
      `review_campaign_contacts?select=queued_at&campaign_id=eq.${c.id}&queued_at=gte.${since}&limit=200`,
      "",
    ),
    settingsFor(c.tenant_id),
    timezoneFor(c.tenant_id),
  ]);
  const q = queued.data ?? [];
  const quota = campaignQuota({
    dailyRate: c.daily_rate,
    queuedLast24h: q.length,
    queuedLastHour: q.filter((x) => Date.parse(x.queued_at) >= hourAgo).length,
    localHour: localHour(now, tz),
    quietStart: s.quietStart,
    quietEnd: s.quietEnd,
  });
  if (quota <= 0) return 0;

  // 3. The next customers on the list.
  budget.take(1);
  const next = await serviceRead<any[]>(
    `review_campaign_contacts?select=id,name,email,phone&campaign_id=eq.${c.id}&tenant_id=eq.${c.tenant_id}&status=eq.waiting&order=id.asc&limit=${quota}`,
    "",
  );
  const people = next.data ?? [];
  if (!people.length) {
    await stopWith("Everyone on the list has been asked.", "finished");
    return 0;
  }

  // 4. Into the normal queue (checks "don't ask again" and opt-outs again).
  budget.take(5);
  const dueAt = outOfQuietHours(now, tz, s.quietStart, s.quietEnd).toISOString();
  const r = await queueRequests(
    c.tenant_id,
    people.map((p) => ({
      name: p.name ?? "",
      email: emailKey(p.email),
      phone: p.phone ?? null,
      channel: emailKey(p.email) ? ("email" as const) : ("whatsapp" as const),
      externalId: `campaign:${c.id}:${p.id}`,
    })),
    {
      dueAt,
      source: "campaign",
      event: "manual",
      externalId: null,
      createdBy: null,
      campaignId: c.id,
      message: c.message,
      emailSubject: c.email_subject,
    },
  );
  if (!r.ok && r.error !== "duplicate") return 0;
  budget.take(1);
  await serviceWrite(
    `review_campaign_contacts?campaign_id=eq.${c.id}&id=in.(${people.map((p) => Number(p.id)).join(",")})`,
    "",
    { method: "PATCH", body: { status: "queued", queued_at: now.toISOString() } },
  );
  return r.ok ? r.added : 0;
}

export async function runCampaigns(budget: Budget): Promise<number> {
  if (!budget.take(1)) return 0;
  const list = await serviceRead<any[]>(
    "review_campaigns?select=id,tenant_id,daily_rate,message,email_subject&status=eq.running&order=updated_at.asc&limit=3",
    "",
  );
  let n = 0;
  for (const c of list.data ?? []) {
    if (!budget.can(14)) break;
    n += await tickCampaign(c, budget).catch(() => 0);
  }
  return n;
}

// ---------- Resend: bounces and spam complaints ----------

export async function recordEmailEvent(type: string, emailId: string): Promise<void> {
  if (!/^[A-Za-z0-9-]{8,100}$/.test(emailId)) return;
  const r = await serviceRead<
    { id: string; tenant_id: string; email: string | null; status: string }[]
  >(`review_requests?select=id,tenant_id,email,status&email_id=eq.${emailId}&limit=1`, "");
  const row = r.data?.[0];
  if (!row) return;
  const now = new Date().toISOString();
  const stop = ["due", "waiting", "opened"].includes(row.status) ? { status: "stopped" } : {};
  if (type === "email.bounced") {
    await serviceWrite(`review_requests?id=eq.${row.id}`, "", {
      method: "PATCH",
      body: { bounced_at: now, error: "Email bounced", ...stop },
    });
  } else if (type === "email.complained") {
    // Marked as spam: treat as unsubscribed, never email them again.
    if (row.email)
      await serviceWrite("review_request_optouts?on_conflict=tenant_id,contact", "", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: [{ tenant_id: row.tenant_id, contact: row.email.toLowerCase() }],
      });
    await serviceWrite(`review_requests?id=eq.${row.id}`, "", {
      method: "PATCH",
      body: { unsubscribed_at: now, ...stop },
    });
    // Accelur8 HQ: store the opt-out (no CRM contact). Never fails the webhook.
    const email = row.email?.toLowerCase();
    if (email) {
      const { customerOptOutEvent } = await import("./hq");
      const { hqAfter } = await import("./hq.server");
      await hqAfter(() =>
        customerOptOutEvent({
          requestId: row.id,
          tenantId: row.tenant_id,
          business: null,
          email,
          phone: null,
          name: null,
          how: "spam_complaint",
        }),
      );
    }
  }
}
