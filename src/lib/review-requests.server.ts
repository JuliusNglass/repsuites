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
  askedRecently,
  DEFAULT_MESSAGE,
  DEFAULT_REMINDER,
  DEFAULT_SUBJECT,
  emailKey,
  fillMessage,
  hasStopSignal,
  looksLikeEmail,
  outOfQuietHours,
  parseTriggerPayload,
  phoneKey,
  reminderDecision,
  reviewerMatches,
  triggeredSendTime,
  type Channel,
  type ReminderDays,
  type TriggerEvent,
} from "./review-requests";

const EDITORS = ["owner", "admin", "super_admin", "manager"];
const ORIGIN = "https://repsuites.com";
// Webhook triggers allowed per business per hour.
const TRIGGERS_PER_HOUR = 120;

export interface RequestSettings {
  countryCode: string;
  firstDelayHours: number;
  reminderDays: number;
  maxReminders: number;
  message: string;
  reminderMessage: string;
  emailSubject: string;
  cooldownDays: number;
  reminder1Days: number;
  reminder2Days: number;
  quietStart: number;
  quietEnd: number;
}

export function linkFor(token: string): string {
  return `${ORIGIN}/q/${token}`;
}

export function triggerUrlFor(token: string): string {
  return `${ORIGIN}/api/review-trigger/${token}`;
}

function newToken(bytes = 12): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
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
    maxReminders: s?.max_reminders ?? 2,
    message: s?.message || DEFAULT_MESSAGE,
    reminderMessage: s?.reminder_message || DEFAULT_REMINDER,
    emailSubject: s?.email_subject || DEFAULT_SUBJECT,
    cooldownDays: s?.cooldown_days ?? 90,
    reminder1Days: s?.reminder1_days ?? 3,
    reminder2Days: s?.reminder2_days ?? 7,
    quietStart: s?.quiet_start ?? 20,
    quietEnd: s?.quiet_end ?? 9,
  };
}

function daysOf(s: RequestSettings): ReminderDays {
  return [s.reminder1Days, Math.max(s.reminder2Days, s.reminder1Days + 1)];
}

export async function timezoneFor(tenantId: string): Promise<string> {
  const r = await serviceRead<{ timezone: string }[]>(
    `tenant_settings?select=timezone&tenant_id=eq.${tenantId}`,
    "",
  );
  return r.data?.[0]?.timezone || "Europe/London";
}

// The business's secret webhook address token, made on first use.
async function triggerTokenFor(tenantId: string, rotate = false): Promise<string | null> {
  if (!rotate) {
    const r = await serviceRead<{ trigger_token: string | null }[]>(
      `review_request_settings?select=trigger_token&tenant_id=eq.${tenantId}`,
      "",
    );
    const t = r.data?.[0]?.trigger_token;
    if (t) return t;
  }
  const token = newToken(24);
  const w = await serviceWrite("review_request_settings?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: { tenant_id: tenantId, trigger_token: token },
  });
  return w.error ? null : token;
}

export async function businessName(tenantId: string): Promise<string> {
  const r = await serviceRead<{ name: string }[]>(`tenants?select=name&id=eq.${tenantId}`, "");
  return r.data?.[0]?.name ?? "us";
}

const LIST_COLUMNS =
  "id,token,name,phone,email,channel,status,step,due_at,last_sent_at,first_sent_at,opened_at,clicked_at,feedback_at,reviewed_at,unsubscribed_at,reminders_sent,skip_reason,source,event,error,created_at,message";

export async function readRequests() {
  const g = await guard(false);
  if (!g.ok) return g;
  await matchGoogleReviews(g.tenantId).catch(() => null);
  await settleDueReminders(g.tenantId, "phone").catch(() => null);
  const [settings, list, business, triggerToken] = await Promise.all([
    settingsFor(g.tenantId),
    serviceRead<any[]>(
      `review_requests?select=${LIST_COLUMNS}&tenant_id=eq.${g.tenantId}&order=created_at.desc&limit=300`,
      "",
    ),
    businessName(g.tenantId),
    triggerTokenFor(g.tenantId),
  ]);
  return {
    ok: true as const,
    business,
    settings,
    triggerUrl: triggerToken ? triggerUrlFor(triggerToken) : null,
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
      clickedAt: r.clicked_at as string | null,
      feedbackAt: r.feedback_at as string | null,
      reviewedAt: r.reviewed_at as string | null,
      unsubscribedAt: r.unsubscribed_at as string | null,
      remindersSent: (r.reminders_sent ?? 0) as number,
      skipReason: r.skip_reason as string | null,
      source: (r.source ?? "manual") as string,
      event: r.event as string | null,
      error: r.error as string | null,
      createdAt: r.created_at as string,
      message: (r.message ?? null) as string | null,
    })),
  };
}

export interface Person {
  name: string;
  phone: string | null;
  email: string | null;
  channel: Channel;
  // Per person (accounting invoices, campaign contacts); overrides opts.externalId.
  externalId?: string | null;
}

// Saves requests for one business. Customers who unsubscribed, or who were
// asked within the "don't ask again" window, are saved as skipped with the
// reason, so the business can see why nothing went out. Used by the Ask tab,
// the webhook, accounting connections and past customer campaigns. People
// whose external id was already used are left out (counted as duplicates).
export async function queueRequests(
  tenantId: string,
  people: Person[],
  opts: {
    dueAt: string;
    source: string;
    event: TriggerEvent | null;
    externalId: string | null;
    createdBy: string | null;
    campaignId?: string | null;
    message?: string | null;
    emailSubject?: string | null;
    // Send Accelur8 HQ a review_requested activity (one outside call).
    hq?: boolean;
  },
): Promise<
  { ok: true; added: number; skipped: number; duplicates: number } | { ok: false; error: string }
> {
  const s = await settingsFor(tenantId);
  const now = new Date();
  let duplicates = 0;
  const ids = people.map((p) => p.externalId).filter((x): x is string => !!x);
  if (ids.length) {
    const have = await serviceRead<{ external_id: string }[]>(
      `review_requests?select=external_id&tenant_id=eq.${tenantId}&external_id=in.(${ids
        .map((i) => `"${encodeURIComponent(i.replace(/"/g, ""))}"`)
        .join(",")})`,
      "",
    );
    const seen = new Set((have.data ?? []).map((h) => h.external_id));
    const before = people.length;
    people = people.filter((p) => {
      if (!p.externalId) return true;
      if (seen.has(p.externalId)) return false;
      seen.add(p.externalId);
      return true;
    });
    duplicates = before - people.length;
    if (!people.length) return { ok: true, added: 0, skipped: 0, duplicates };
  }
  const since = new Date(now.getTime() - s.cooldownDays * 86400000).toISOString();
  const [pastR, outR] = await Promise.all([
    serviceRead<
      { email: string | null; phone_key: string | null; status: string; created_at: string }[]
    >(
      `review_requests?select=email,phone_key,status,created_at&tenant_id=eq.${tenantId}&created_at=gte.${since}&status=neq.skipped&limit=5000`,
      "",
    ),
    serviceRead<{ contact: string }[]>(
      `review_request_optouts?select=contact&tenant_id=eq.${tenantId}&limit=10000`,
      "",
    ),
  ]);
  const past = pastR.data ?? [];
  const optedOut = new Set((outR.data ?? []).map((o) => o.contact));
  let skipped = 0;
  const rows = people
    .filter((p) => (p.channel === "email" ? p.email && looksLikeEmail(p.email) : p.phone))
    .slice(0, 200)
    .map((p) => {
      const email = emailKey(p.email);
      const pk = phoneKey(p.phone, s.countryCode);
      let skip: "asked_recently" | "unsubscribed" | null = null;
      if ((email && optedOut.has(email)) || (pk && optedOut.has(pk))) skip = "unsubscribed";
      else if (askedRecently({ email, phoneKey: pk }, past, s.cooldownDays, now))
        skip = "asked_recently";
      if (skip) skipped++;
      else past.push({ email, phone_key: pk, status: "due", created_at: now.toISOString() });
      return {
        tenant_id: tenantId,
        token: newToken(),
        name: p.name.trim().slice(0, 80) || null,
        phone: p.phone?.trim().slice(0, 30) || null,
        phone_key: pk,
        email: p.email?.trim().toLowerCase().slice(0, 200) || null,
        channel: p.channel,
        status: skip ? "skipped" : "due",
        skip_reason: skip,
        step: 0,
        due_at: opts.dueAt,
        source: opts.source,
        event: opts.event,
        external_id: p.externalId ?? opts.externalId,
        created_by: opts.createdBy,
        campaign_id: opts.campaignId ?? null,
        message: opts.message ?? null,
        email_subject: opts.emailSubject ?? null,
      };
    });
  if (!rows.length) return { ok: false, error: "Add a phone number or email for each customer." };
  const w = await serviceWrite("review_requests", "", { method: "POST", body: rows });
  if (w.error)
    return {
      ok: false,
      error: /duplicate|23505|409|conflict/i.test(w.error)
        ? "duplicate"
        : "Could not save. Try again.",
    };
  const added = rows.length - skipped;
  // Accelur8 HQ, activity only: one call per batch, and only where the caller
  // asks (the scheduled campaign and accounting runs share a tight
  // outside-call budget, so they leave it out). Never fails the save.
  const first = rows[0];
  if (opts.hq && added > 0 && first) {
    const { reviewRequestedEvent } = await import("./hq");
    const { hqAfter } = await import("./hq.server");
    await hqAfter(() =>
      reviewRequestedEvent({
        tenantId,
        batchKey: first.token,
        business: null,
        added,
        skipped,
        source: opts.source,
        channels: [...new Set(rows.filter((r) => !r.skip_reason).map((r) => r.channel))],
      }),
    );
  }
  return { ok: true, added, skipped, duplicates };
}

export async function addRequests(input: { people: Person[]; sendNow: boolean }) {
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
  const r = await queueRequests(g.tenantId, input.people, {
    dueAt: due,
    source: "manual",
    event: "manual",
    externalId: null,
    createdBy: g.userId,
    hq: true,
  });
  return r.ok
    ? r
    : { ok: false as const, error: r.error === "duplicate" ? "Already added." : r.error };
}

// The webhook: POST /api/review-trigger/<token> from GoHighLevel, Zapier,
// Make or anything that can post JSON or a form.
export async function handleTrigger(
  token: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token))
    return { status: 404, body: { ok: false, error: "Unknown address" } };
  const t = await serviceRead<{ tenant_id: string }[]>(
    `review_request_settings?select=tenant_id&trigger_token=eq.${token}`,
    "",
  );
  const tenantId = t.data?.[0]?.tenant_id;
  if (!tenantId) return { status: 404, body: { ok: false, error: "Unknown address" } };
  const input = parseTriggerPayload(body);
  if (!input) return { status: 400, body: { ok: false, error: "Send an email or phone number" } };
  const { tenantHasFeatureService } = await import("./tenant-access.server");
  if (!(await tenantHasFeatureService(tenantId, "growth")))
    return { status: 402, body: { ok: false, error: "Review requests are not in this plan" } };
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const recent = await serviceRead<{ id: string }[]>(
    `review_requests?select=id&tenant_id=eq.${tenantId}&source=eq.webhook&created_at=gte.${hourAgo}&limit=${TRIGGERS_PER_HOUR + 1}`,
    "",
  );
  if ((recent.data?.length ?? 0) >= TRIGGERS_PER_HOUR)
    return { status: 429, body: { ok: false, error: "Too many requests. Try again later." } };
  if (input.externalId) {
    const dup = await serviceRead<{ id: string }[]>(
      `review_requests?select=id&tenant_id=eq.${tenantId}&external_id=eq.${encodeURIComponent(input.externalId)}&limit=1`,
      "",
    );
    if (dup.data?.length) return { status: 200, body: { ok: true, result: "duplicate" } };
  }
  const [s, tz] = await Promise.all([settingsFor(tenantId), timezoneFor(tenantId)]);
  const dueAt = triggeredSendTime(new Date(), s.firstDelayHours, tz, {
    start: s.quietStart,
    end: s.quietEnd,
  }).toISOString();
  const r = await queueRequests(
    tenantId,
    [
      {
        name: input.name,
        email: input.email,
        phone: input.phone,
        channel: input.email ? "email" : "whatsapp",
      },
    ],
    {
      dueAt,
      source: "webhook",
      event: input.event,
      externalId: input.externalId,
      createdBy: null,
      hq: true,
    },
  );
  if (!r.ok)
    return r.error === "duplicate"
      ? { status: 200, body: { ok: true, result: "duplicate" } }
      : { status: 500, body: { ok: false, error: r.error } };
  return {
    status: 200,
    body: r.skipped
      ? { ok: true, result: "skipped" }
      : { ok: true, result: "queued", send_at: dueAt },
  };
}

export async function rotateTriggerUrl() {
  const g = await guard(true);
  if (!g.ok) return g;
  const t = await triggerTokenFor(g.tenantId, true);
  return t
    ? { ok: true as const, triggerUrl: triggerUrlFor(t) }
    : { ok: false as const, error: "Could not make a new address." };
}

function nextAfterSend(
  row: { step: number; first_sent_at: string | null },
  s: RequestSettings,
  tz: string,
  now: Date,
) {
  const first = row.first_sent_at ? new Date(row.first_sent_at) : now;
  const next = afterSend(row.step, s.maxReminders, daysOf(s), first, now);
  const dueAt =
    next.status === "waiting"
      ? outOfQuietHours(new Date(next.dueAt), tz, s.quietStart, s.quietEnd).toISOString()
      : next.dueAt;
  return {
    step: next.step,
    status: next.status,
    due_at: dueAt,
    last_sent_at: now.toISOString(),
    first_sent_at: first.toISOString(),
    error: null,
  };
}

// After the business sends a WhatsApp or text from its own phone.
export async function markRequestSent(id: string) {
  const g = await guard(true);
  if (!g.ok) return g;
  const [s, tz] = await Promise.all([settingsFor(g.tenantId), timezoneFor(g.tenantId)]);
  const r = await serviceRead<
    { step: number; status: string; first_sent_at: string | null; reminders_sent: number }[]
  >(
    `review_requests?select=step,status,first_sent_at,reminders_sent&id=eq.${id}&tenant_id=eq.${g.tenantId}`,
    "",
  );
  const cur = r.data?.[0];
  if (!cur) return { ok: false as const, error: "Not found." };
  if (!["due", "waiting"].includes(cur.status)) return { ok: true as const };
  await serviceWrite(`review_requests?id=eq.${id}&tenant_id=eq.${g.tenantId}`, "", {
    method: "PATCH",
    body: {
      ...nextAfterSend(cur, s, tz, new Date()),
      reminders_sent: Math.min(2, (cur.reminders_sent ?? 0) + (cur.step > 0 ? 1 : 0)),
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
      reminder_days: s.reminder1Days,
      max_reminders: s.maxReminders,
      message: s.message === DEFAULT_MESSAGE ? null : s.message,
      reminder_message: s.reminderMessage === DEFAULT_REMINDER ? null : s.reminderMessage,
      email_subject: s.emailSubject === DEFAULT_SUBJECT ? null : s.emailSubject,
      cooldown_days: s.cooldownDays,
      reminder1_days: s.reminder1Days,
      reminder2_days: Math.max(s.reminder2Days, s.reminder1Days + 1),
      quiet_start: s.quietStart,
      quiet_end: s.quietEnd,
      updated_by: g.userId,
      updated_at: new Date().toISOString(),
    },
  });
  return w.error ? { ok: false as const, error: "Could not save." } : { ok: true as const };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ---------- signals that stop reminders ----------

// A Google review from someone whose first and last name match a customer we
// asked (after we asked) marks that request as reviewed.
export async function matchGoogleReviews(tenantId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const open = await serviceRead<{ id: string; name: string | null; created_at: string }[]>(
    `review_requests?select=id,name,created_at&tenant_id=eq.${tenantId}&reviewed_at=is.null&status=in.(due,waiting,opened,finished)&created_at=gte.${since}&name=not.is.null&limit=500`,
    "",
  );
  const asks = (open.data ?? []).filter((r) => (r.name ?? "").trim().includes(" "));
  if (!asks.length) return 0;
  const oldest = asks.reduce((m, r) => (r.created_at < m ? r.created_at : m), asks[0]!.created_at);
  const reviews = await serviceRead<
    { reviewer: string | null; created_at_google: string | null }[]
  >(
    `google_reviews?select=reviewer,created_at_google&tenant_id=eq.${tenantId}&created_at_google=gte.${oldest}&limit=500`,
    "",
  );
  let n = 0;
  for (const a of asks) {
    const hit = (reviews.data ?? []).find(
      (rv) =>
        rv.reviewer &&
        rv.created_at_google &&
        rv.created_at_google >= a.created_at &&
        reviewerMatches(a.name!, rv.reviewer),
    );
    if (!hit) continue;
    await serviceWrite(`review_requests?id=eq.${a.id}&tenant_id=eq.${tenantId}`, "", {
      method: "PATCH",
      body: { reviewed_at: hit.created_at_google, status: "finished" },
    });
    n++;
  }
  return n;
}

async function requestByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
  const r = await serviceRead<
    {
      id: string;
      tenant_id: string;
      status: string;
      opened_at: string | null;
      clicked_at: string | null;
      email: string | null;
      phone_key: string | null;
      phone: string | null;
      name: string | null;
    }[]
  >(
    `review_requests?select=id,tenant_id,status,opened_at,clicked_at,email,phone_key,phone,name&token=eq.${token}`,
    "",
  );
  return r.data?.[0] ?? null;
}

function finishedBody(status: string, extra: Record<string, unknown>) {
  // Stop reminders, but keep "stopped" and "skipped" as they are.
  return ["due", "waiting", "opened"].includes(status) ? { ...extra, status: "finished" } : extra;
}

// Private feedback from the review page.
export async function recordRequestFeedback(token: string, tenantId: string): Promise<void> {
  const row = await requestByToken(token);
  if (!row || row.tenant_id !== tenantId) return;
  await serviceWrite(`review_requests?id=eq.${row.id}`, "", {
    method: "PATCH",
    body: finishedBody(row.status, { feedback_at: new Date().toISOString() }),
  });
}

// A tap on a review site button. Returns the review site address.
export async function recordRequestClick(
  token: string,
  qrId: string,
  index: number,
): Promise<string | null> {
  const row = await requestByToken(token);
  if (!row) return null;
  const { loadFeedbackTarget } = await import("./feedback-page.server");
  const t = await loadFeedbackTarget(qrId.toLowerCase());
  if (!t || t.tenantId !== row.tenant_id) return null;
  const link = t.links[index] ?? t.links[0];
  if (!link) return null;
  if (!row.clicked_at)
    await serviceWrite(`review_requests?id=eq.${row.id}`, "", {
      method: "PATCH",
      body: finishedBody(row.status, {
        clicked_at: new Date().toISOString(),
        ...(row.opened_at ? {} : { opened_at: new Date().toISOString() }),
      }),
    });
  return link.url;
}

// Unsubscribe: this business never emails (or lists for a message) this
// customer again.
export async function unsubscribeRequest(token: string): Promise<boolean> {
  const row = await requestByToken(token);
  if (!row) return false;
  const now = new Date().toISOString();
  const contacts = [row.email?.toLowerCase(), row.phone_key].filter(
    (c): c is string => !!c && c.length >= 3,
  );
  if (contacts.length)
    await serviceWrite("review_request_optouts?on_conflict=tenant_id,contact", "", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: contacts.map((contact) => ({ tenant_id: row.tenant_id, contact })),
    });
  await serviceWrite(`review_requests?id=eq.${row.id}`, "", {
    method: "PATCH",
    body: { unsubscribed_at: now, status: row.status === "skipped" ? "skipped" : "stopped" },
  });
  // Any other pending asks to the same customer stop too.
  for (const c of contacts) {
    const col = c.includes("@") ? "email" : "phone_key";
    await serviceWrite(
      `review_requests?tenant_id=eq.${row.tenant_id}&${col}=eq.${encodeURIComponent(c)}&status=in.(due,waiting,opened)`,
      "",
      { method: "PATCH", body: { status: "stopped", unsubscribed_at: now } },
    );
  }
  // Accelur8 HQ: store the opt-out (no CRM contact). Never fails the unsubscribe.
  const { customerOptOutEvent } = await import("./hq");
  const { hqAfter } = await import("./hq.server");
  await hqAfter(async () =>
    customerOptOutEvent({
      requestId: row.id,
      tenantId: row.tenant_id,
      // businessName falls back to "us" for the email copy; HQ wants null.
      business: await businessName(row.tenant_id).then((b) => (b === "us" ? null : b)),
      email: row.email?.toLowerCase() ?? null,
      phone: row.phone,
      name: row.name,
      how: "unsubscribe",
    }),
  );
  return true;
}

// Due reminders that should not go out as they are: the customer already
// acted (finish), or opened without clicking (jump to the last reminder).
async function settleDueReminders(tenantId: string, which: "email" | "phone") {
  const channel = which === "email" ? "channel=eq.email" : "channel=in.(whatsapp,sms)";
  const due = await serviceRead<any[]>(
    `review_requests?select=id,step,first_sent_at,opened_at,clicked_at,feedback_at,reviewed_at,unsubscribed_at&tenant_id=eq.${tenantId}&${channel}&status=in.(due,waiting)&step=gte.1&due_at=lte.${new Date().toISOString()}&limit=200`,
    "",
  );
  if (!due.data?.length) return;
  const s = await settingsFor(tenantId);
  const now = new Date();
  for (const r of due.data) {
    const d = reminderDecision(
      {
        step: r.step,
        openedAt: r.opened_at,
        clickedAt: r.clicked_at,
        feedbackAt: r.feedback_at,
        reviewedAt: r.reviewed_at,
        unsubscribedAt: r.unsubscribed_at,
      },
      s.maxReminders,
      daysOf(s),
      r.first_sent_at ? new Date(r.first_sent_at) : null,
      now,
    );
    if (d.action === "send") continue;
    await serviceWrite(`review_requests?id=eq.${r.id}&tenant_id=eq.${tenantId}`, "", {
      method: "PATCH",
      body: d.action === "finish" ? { status: "finished" } : { step: d.step, due_at: d.dueAt },
    });
  }
}

// Called by the database every 10 minutes: emails every due email request.
export async function runEmailRequests(token: string) {
  const ok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
    method: "POST",
    body: { p_token: token },
  });
  if (ok.error || ok.data !== true) return { status: 401, body: { ok: false } };
  const nowIso = () => new Date().toISOString();
  const dueQuery = () =>
    serviceRead<any[]>(
      `review_requests?select=id,tenant_id,token,name,email,step,first_sent_at,reminders_sent,opened_at,clicked_at,feedback_at,reviewed_at,unsubscribed_at,message,email_subject,campaign_id&channel=eq.email&status=in.(due,waiting)&due_at=lte.${nowIso()}&order=due_at.asc&limit=40`,
      "",
    );
  // First settle reminders for every business with something due.
  const first = await dueQuery();
  const tenants = [...new Set((first.data ?? []).map((r) => r.tenant_id as string))];
  for (const t of tenants) {
    await matchGoogleReviews(t).catch(() => null);
    await settleDueReminders(t, "email").catch(() => null);
  }
  const due = tenants.length ? await dueQuery() : first;
  const { sendEmail } = await import("./email.server");
  const cache = new Map<
    string,
    { s: RequestSettings; business: string; tz: string; out: Set<string> }
  >();
  let sent = 0;
  for (const r of due.data ?? []) {
    if (
      hasStopSignal({
        clickedAt: r.clicked_at,
        feedbackAt: r.feedback_at,
        reviewedAt: r.reviewed_at,
        unsubscribedAt: r.unsubscribed_at,
      })
    )
      continue;
    let c = cache.get(r.tenant_id);
    if (!c) {
      const [s, business, tz, out] = await Promise.all([
        settingsFor(r.tenant_id),
        businessName(r.tenant_id),
        timezoneFor(r.tenant_id),
        serviceRead<{ contact: string }[]>(
          `review_request_optouts?select=contact&tenant_id=eq.${r.tenant_id}&limit=10000`,
          "",
        ),
      ]);
      c = { s, business, tz, out: new Set((out.data ?? []).map((o) => o.contact)) };
      cache.set(r.tenant_id, c);
    }
    const email = emailKey(r.email);
    if (!email || c.out.has(email)) {
      await serviceWrite(`review_requests?id=eq.${r.id}`, "", {
        method: "PATCH",
        body: { status: "stopped", ...(email ? { unsubscribed_at: nowIso() } : {}) },
      });
      continue;
    }
    const vars = { name: r.name ?? "", business: c.business, link: linkFor(r.token) };
    const unsub = `${vars.link}?unsub=1`;
    const body = fillMessage(r.step === 0 ? r.message || c.s.message : c.s.reminderMessage, vars);
    const text = body.replace(vars.link, "").trim();
    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;max-width:520px;line-height:1.5">` +
      `<p>${esc(text)}</p>` +
      `<p><a href="${vars.link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Leave a quick review</a></p>` +
      `<p style="color:#6b7280;font-size:14px;margin-top:24px">You received this because you ${r.campaign_id ? "have used" : "recently used"} ${esc(c.business)}. ` +
      `<a href="${unsub}" style="color:#6b7280">Unsubscribe</a> and ${esc(c.business)} will not email you about reviews again.</p></div>`;
    const res = await sendEmail({
      to: email,
      subject: fillMessage((r.step === 0 && r.email_subject) || c.s.emailSubject, vars),
      html,
      text: `${body}\n\nUnsubscribe: ${unsub}`,
      headers: {
        "List-Unsubscribe": `<${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    const now = new Date();
    if (res.ok) {
      await serviceWrite(`review_requests?id=eq.${r.id}`, "", {
        method: "PATCH",
        body: {
          ...nextAfterSend(r, c.s, c.tz, now),
          reminders_sent: Math.min(2, (r.reminders_sent ?? 0) + (r.step > 0 ? 1 : 0)),
          ...(res.id ? { email_id: res.id.slice(0, 100) } : {}),
        },
      });
      sent++;
    } else {
      // Try again in an hour.
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

// The tracked link a customer opens. Opening is a soft signal (recorded, but
// reminders only stop on a tap on a review site, private feedback, a matching
// Google review or unsubscribing). Goes on to the business's review page with
// the token, so those taps can be recorded.
export async function openRequest(
  token: string,
  record = true,
): Promise<{ redirect: string } | { page: "missing" }> {
  const row = await requestByToken(token);
  if (!row) return { page: "missing" };
  const qr = await serviceRead<{ id: string; kind: string }[]>(
    `qr_links?select=id,kind&tenant_id=eq.${row.tenant_id}&active=eq.true&order=kind.asc,created_at.asc&limit=5`,
    "",
  );
  const pick = (qr.data ?? []).find((q) => q.kind === "business") ?? qr.data?.[0];
  if (pick) {
    if (record && !row.opened_at)
      await serviceWrite(`review_requests?id=eq.${row.id}`, "", {
        method: "PATCH",
        body: { opened_at: new Date().toISOString() },
      });
    return { redirect: `${ORIGIN}/feedback/${pick.id}?rq=${token}` };
  }
  const links = await serviceRead<{ url: string }[]>(
    `review_links?select=url&tenant_id=eq.${row.tenant_id}&active=eq.true&order=position.asc&limit=1`,
    "",
  );
  const url = links.data?.[0]?.url;
  if (!url || !url.startsWith("https://")) return { page: "missing" };
  // No review page: the link goes straight to the review site, so opening it
  // is the tap.
  if (record && !row.clicked_at) {
    const at = new Date().toISOString();
    await serviceWrite(`review_requests?id=eq.${row.id}`, "", {
      method: "PATCH",
      body: finishedBody(row.status, { opened_at: row.opened_at ?? at, clicked_at: at }),
    });
  }
  return { redirect: url };
}
