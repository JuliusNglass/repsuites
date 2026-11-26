// Growth chase: runs every 10 minutes (database cron). Qualified growth leads get texts
// to book the Fit Call themselves; unqualified ones (solo/researching) get texts to the free Google Check.
import { crmFetch } from "./crm-store.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { GHL_LOCATION_ID } from "./ghl-lead";
import { sendAccelur8Sms, startAccelur8Nurture } from "./hq.server";
import { FIT_CALL_CALENDAR } from "./growth-join";
import {
  offerFor,
  salesLink,
  chaseDue,
  chaseSms,
  firstSms,
  welcomeSms,
  growSms,
  isLater,
  isFunnelV4,
  readySms,
  laterFirstSms,
  bookLink,
  watchedVideo,
  watchedSms,
  laterSms,
  whyLink,
  chaseWindowOk,
  isCheckRoute,
  CHASE_MAX_HOURS,
  CHASE_STOP_TAGS,
} from "./growth-chase";

type Contact = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  dnd?: boolean;
  dateAdded?: string;
  companyName?: string | null;
  b?: string | null;
};

async function ghl(path: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await crmFetch(`${path}`, {
      ...init,
      headers: {
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
}

async function hasUpcomingFitCall(contactId: string): Promise<boolean> {
  const r = await ghl(`/contacts/${contactId}/appointments`);
  if (!r?.ok) return false;
  const events = (
    (await r.json().catch(() => ({}))) as {
      events?: {
        calendarId?: string;
        startTime?: string;
        deleted?: boolean;
        appointmentStatus?: string;
      }[];
    }
  ).events;
  const now = Date.now() - 3_600_000;
  return (events ?? []).some(
    (e) =>
      !e.deleted &&
      e.calendarId === FIT_CALL_CALENDAR &&
      !["cancelled", "invalid"].includes(e.appointmentStatus ?? "") &&
      new Date((e.startTime ?? "").replace(" ", "T") + "Z").getTime() > now,
  );
}

async function qualifiedLeads(): Promise<Contact[]> {
  const r = await ghl("/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      locationId: GHL_LOCATION_ID,
      pageLimit: 100,
      filters: [{ field: "tags", operator: "contains", value: "grw-lead" }],
      sort: [{ field: "dateAdded", direction: "desc" }],
    }),
  });
  if (!r?.ok) {
    console.error("growth chase: GHL search failed", r?.status);
    return [];
  }
  const cutoff = Date.now() - CHASE_MAX_HOURS * 3_600_000;
  return (((await r.json()) as { contacts?: Contact[] }).contacts ?? []).filter(
    (c) =>
      c.dateAdded &&
      new Date(c.dateAdded).getTime() >= cutoff &&
      (c.tags ?? []).some((t) => t === "qualified" || t === "nurture" || t === "solo"),
  );
}

export async function runGrowthChase(token: string) {
  const ok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
    method: "POST",
    body: { p_token: token },
  });
  if (ok.error || ok.data !== true) return { status: 401, body: { ok: false } };
  const now = new Date();
  const { backfillFromGhl } = await import("./crm-store.server");
  await backfillFromGhl().catch(() => 0);
  const nudged = await noShowNudges(now);

  const leads = await qualifiedLeads();
  if (!leads.length) return { status: 200, body: { ok: true, sent: 0, nudged } };
  const ids = leads.map((c) => `"${c.id.replace(/"/g, "")}"`).join(",");
  const done = await serviceRead<{ contact_id: string; step: number }[]>(
    `growth_chase?select=contact_id,step&contact_id=in.(${encodeURIComponent(ids)})`,
    "",
  );
  if (done.error) return { status: 500, body: { ok: false } };
  const doneBy = new Map<string, number[]>();
  for (const d of done.data ?? [])
    doneBy.set(d.contact_id, [...(doneBy.get(d.contact_id) ?? []), d.step]);

  let sent = 0;
  for (let c of leads) {
    if (!c.phone || c.dnd || (c.tags ?? []).some((t) => CHASE_STOP_TAGS.includes(t))) continue;
    const step = chaseDue(c.dateAdded ?? "", doneBy.get(c.id) ?? [], now);
    if (!step || !chaseWindowOk(step, now)) continue;
    const tags = c.tags ?? [];
    const check = isCheckRoute(tags);
    // Unqualified leads get one welcome text only; later steps are recorded as skipped.
    if (check && step > 1) {
      await serviceWrite("growth_chase", "", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: { contact_id: c.id, step, status: "skipped" },
      });
      continue;
    }
    // Never chase someone who has already booked, even if the booked tag has
    // not been added yet (GHL workflows can lag or be paused).
    if (!check && (await hasUpcomingFitCall(c.id))) {
      await serviceWrite("growth_chase", "", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: { contact_id: c.id, step, status: "skipped" },
      });
      continue;
    }
    // Their SparkOps booking link (growth_booking), so pages book in SparkOps.
    const bk = await serviceRead<{ book_url: string }[]>(
      `growth_booking?select=book_url&or=(${[
        c.email ? `email.eq.${encodeURIComponent(c.email.toLowerCase())}` : "",
        c.phone ? `phone.eq.${encodeURIComponent(c.phone)}` : "",
      ]
        .filter(Boolean)
        .join(",")})&order=created_at.desc&limit=1`,
      "",
    ).catch(() => null);
    const bt = /\/lead\/([0-9a-f]{36})$/.exec(bk?.data?.[0]?.book_url ?? "")?.[1] ?? null;
    if (bt) c = { ...c, b: bt };
    const v4 = isFunnelV4(tags);
    const message = check
      ? welcomeSms(c.firstName, c.companyName)
      : v4 && isLater(tags)
        ? step === 1
          ? laterFirstSms(c.firstName, c.companyName, whyLink(c))
          : laterSms(step, c.firstName, whyLink(c))
        : v4
          ? readySms(step, c.firstName, c.companyName, bookLink(c))
          : step === 1
            ? firstSms(
                c.firstName,
                c.companyName,
                salesLink(tags.includes("solo-grow") ? "commercial" : offerFor(tags), c),
              )
            : watchedVideo(tags) && !isLater(tags)
              ? watchedSms(step, c.firstName, salesLink(offerFor(tags), c))
              : isLater(tags)
                ? laterSms(step, c.firstName, whyLink(c))
                : tags.includes("solo-grow")
                  ? growSms(step, c.firstName, salesLink("commercial", c))
                  : chaseSms(step, c.firstName, salesLink(offerFor(tags), c), offerFor(tags));
    // From the Accelur8 SparkOps number (replies land in SparkOps), not GHL.
    const sentOk = await sendAccelur8Sms({
      phone: c.phone ?? "",
      message,
      idempotencyKey: `grw-chase-${c.id}-${step}`,
      source: "growth_chase",
    });
    // A failed send is not recorded, so the next run retries it.
    if (!sentOk) {
      console.error("growth chase: SMS failed");
      continue;
    }
    const status = "sent";
    await serviceWrite("growth_chase", "", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: { contact_id: c.id, step, status },
    });
    if (sentOk) sent++;
    // Call prep: the lead's own video link on their contact, to share on a call.
    if (step === 1)
      await ghl(`/contacts/${c.id}/notes`, {
        method: "POST",
        body: JSON.stringify({
          body: `Call video (tracked, this lead only): ${salesLink("commercial", c)}\nYouTube copy: https://youtu.be/ByRUFtEiSe4`,
        }),
      });
    // Unqualified leads go straight into the 12-month lessons (now in SparkOps).
    const who = {
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      email: c.email ?? null,
      phone: c.phone ?? null,
    };
    if (sentOk && (check || step === 3)) await startAccelur8Nurture(who);
    if (sentOk && check)
      await ghl(`/contacts/${c.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: ["nurture", "nurture-12m"] }),
      });
    // After the last text, hand them to the long nurture (never dropped).
    if (sentOk && step === 3)
      await ghl(`/contacts/${c.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: ["grw-nobook", "nurture", "nurture-12m"] }),
      });
  }
  const started = chaseWindowOk(2, now) ? await startReminders(now) : 0;
  return { status: 200, body: { ok: true, sent, started, nudged } };
}

// Leads who picked a start month get the booking link 14 days before that month.
async function startReminders(now: Date): Promise<number> {
  const { reminderDue, startSms } = await import("./growth-month");
  const r = await ghl("/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      locationId: GHL_LOCATION_ID,
      pageLimit: 100,
      filters: [{ field: "tags", operator: "contains", value: "grw-month-picked" }],
    }),
  });
  if (!r?.ok) return 0;
  let n = 0;
  for (const c of ((await r.json()) as { contacts?: Contact[] }).contacts ?? []) {
    const tags = c.tags ?? [];
    if (!c.phone || c.dnd || tags.includes("start-sent") || tags.includes("grw-booked")) continue;
    const m = tags.find((t) => /^start-20\d\d-\d\d$/.test(t))?.slice(6);
    if (!m || !reminderDue(m, now)) continue;
    const q = new URLSearchParams({
      first_name: c.firstName ?? "",
      last_name: c.lastName ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
    });
    const link = `https://growth.accelur8clientwork.com/book?${q}`;
    const s = await sendAccelur8Sms({
      phone: c.phone,
      message: startSms(c.firstName, m, link),
      idempotencyKey: `grw-start-${c.id}-${m}`,
      source: "growth_start",
    });
    if (!s) continue;
    await ghl(`/contacts/${c.id}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: ["start-sent"] }),
    });
    n++;
  }
  return n;
}

// Fit Calls that started 3 to 15 minutes ago where the lead hasn't tapped the join link:
// one "we're on the call now" text each.
async function noShowNudges(now: Date): Promise<number> {
  const { FIT_CALL_CALENDAR, nudgeDue, nudgeSms, joinLink } = await import("./growth-join");
  const q = new URLSearchParams({
    locationId: GHL_LOCATION_ID,
    calendarId: FIT_CALL_CALENDAR,
    startTime: String(now.getTime() - 20 * 60_000),
    endTime: String(now.getTime()),
  });
  const r = await ghl(`/calendars/events?${q}`);
  if (!r?.ok) return 0;
  type Ev = {
    id: string;
    contactId?: string;
    startTime?: string;
    deleted?: boolean;
    appointmentStatus?: string;
  };
  const due = (((await r.json()) as { events?: Ev[] }).events ?? []).filter(
    (e) =>
      !e.deleted &&
      e.contactId &&
      e.startTime &&
      !["cancelled", "invalid", "noshow"].includes(e.appointmentStatus ?? "") &&
      nudgeDue(e.startTime, now),
  );
  if (!due.length) return 0;
  const ids = due.map((e) => `"${e.id.replace(/"/g, "")}"`).join(",");
  const seen = await serviceRead<
    { appt_id: string; joined_at: string | null; nudged_at: string | null }[]
  >(`growth_join?select=appt_id,joined_at,nudged_at&appt_id=in.(${encodeURIComponent(ids)})`, "");
  if (seen.error) return 0;
  const skip = new Set(
    (seen.data ?? []).filter((x) => x.joined_at || x.nudged_at).map((x) => x.appt_id),
  );
  let n = 0;
  for (const e of due) {
    if (skip.has(e.id)) continue;
    // Claim the nudge first, so two runs can never text the same person twice.
    const claim = await serviceWrite<unknown[]>("growth_join", "", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: {
        appt_id: e.id,
        contact_id: e.contactId,
        start_at: e.startTime,
        nudged_at: now.toISOString(),
      },
    });
    if (claim.error || !Array.isArray(claim.data) || !claim.data.length) continue;
    const cr = await ghl(`/contacts/${e.contactId}`);
    const c = cr?.ok ? ((await cr.json()) as { contact?: Contact }).contact : null;
    if (!c?.phone || c.dnd) continue;
    const s = await sendAccelur8Sms({
      phone: c.phone,
      message: nudgeSms(c.firstName, joinLink(c.id)),
      idempotencyKey: `grw-nudge-${e.id}`,
      source: "growth_nudge",
    });
    if (s) n++;
    else console.error("growth join: nudge failed");
  }
  return n;
}
