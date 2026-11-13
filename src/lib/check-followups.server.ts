// Free Google Check follow-ups: runs every hour (database cron). Sends the
// next due nudge to each recent check, by text (through GHL) or email.
// Stops for good when the person has paid, replied, opted out or is marked
// as a customer.
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { sendEmail } from "./email.server";
import { GHL_LOCATION_ID } from "./ghl-lead";
import {
  dueStep,
  followupMessage,
  inSendWindow,
  MAX_AGE_HOURS,
  STEPS,
  type FollowupLead,
} from "./check-followups";

const STOP_TAGS = ["replied", "customer", "fixit-paid", "repsuites-customer", "no-followup"];

function julius(): string {
  return (process.env["REPSUITES_LEADS_TO"] ?? "").trim() || "julius@accelur8.com";
}

type GhlContact = { id: string; tags: string[]; dnd: boolean };

async function ghl(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token) return null;
  try {
    return await fetch(`https://services.leadconnectorhq.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
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

async function findContact(lead: FollowupLead): Promise<GhlContact | null> {
  const q = new URLSearchParams({ locationId: GHL_LOCATION_ID });
  if (lead.email) q.set("email", lead.email);
  else if (lead.phone) q.set("number", lead.phone);
  const r = await ghl(`/contacts/search/duplicate?${q}`);
  if (!r?.ok) return null;
  const c = ((await r.json()) as { contact?: { id?: string; tags?: string[]; dnd?: boolean } })
    .contact;
  return c?.id ? { id: c.id, tags: c.tags ?? [], dnd: !!c.dnd } : null;
}

async function sendSms(contactId: string, message: string): Promise<boolean> {
  const r = await ghl("/conversations/messages", {
    method: "POST",
    body: JSON.stringify({ type: "SMS", contactId, message }),
  });
  if (r && !r.ok) console.error("check follow-up SMS failed", r.status);
  return !!r?.ok;
}

async function record(leadId: string, step: number, channel: string, status: string) {
  await serviceWrite("check_followups", "", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: { lead_id: leadId, step, channel, status },
  });
}

async function stopAll(leadId: string, done: number[], why: string) {
  for (const s of STEPS) if (!done.includes(s.step)) await record(leadId, s.step, "none", why);
}

type LeadRow = {
  id: string;
  name: string;
  business_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  google_place_id: string | null;
};

export async function runCheckFollowups(token: string) {
  const ok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
    method: "POST",
    body: { p_token: token },
  });
  if (ok.error || ok.data !== true) return { status: 401, body: { ok: false } };

  const now = new Date();
  if (!inSendWindow(now)) return { status: 200, body: { ok: true, skipped: "outside hours" } };

  const since = new Date(now.getTime() - (MAX_AGE_HOURS + 24 * 8) * 3_600_000).toISOString();
  const leads = await serviceRead<LeadRow[]>(
    `leads?select=id,name,business_name,email,phone,created_at,google_place_id&created_at=gte.${since}&google_place_id=not.is.null&order=created_at.asc&limit=200`,
    "",
  );
  if (leads.error) return { status: 500, body: { ok: false } };
  const rows = leads.data ?? [];
  if (!rows.length) return { status: 200, body: { ok: true, sent: 0 } };

  const ids = rows.map((r) => r.id).join(",");
  const places = [...new Set(rows.map((r) => r.google_place_id).filter(Boolean))]
    .map((p) => `"${String(p).replace(/"/g, "")}"`)
    .join(",");
  const [done, prospects] = await Promise.all([
    serviceRead<{ lead_id: string; step: number }[]>(
      `check_followups?select=lead_id,step&lead_id=in.(${ids})`,
      "",
    ),
    serviceRead<
      { place_id: string; report_token: string | null; stage: string; report: unknown }[]
    >(
      `prospects?select=place_id,report_token,stage,report&place_id=in.(${encodeURIComponent(places)})`,
      "",
    ),
  ]);
  const doneBy = new Map<string, number[]>();
  for (const d of done.data ?? [])
    doneBy.set(d.lead_id, [...(doneBy.get(d.lead_id) ?? []), d.step]);
  const byPlace = new Map((prospects.data ?? []).map((p) => [p.place_id, p]));

  const sent: string[] = [];
  let budget = 25; // per run, keeps each run short
  for (const row of rows) {
    if (budget <= 0) break;
    const p = row.google_place_id ? byPlace.get(row.google_place_id) : undefined;
    const report = (p?.report ?? {}) as { maps?: { keyword?: string } };
    const lead: FollowupLead = {
      id: row.id,
      name: row.name,
      business: row.business_name,
      email: row.email,
      phone: row.phone,
      createdAt: row.created_at,
      reportToken: p?.report_token ?? null,
      keyword: report.maps?.keyword ?? null,
    };
    const prior = doneBy.get(row.id) ?? [];
    const step = dueStep(lead, prior, now);
    if (!step) continue;
    budget--;

    if (p && ["replied", "booked", "won", "lost"].includes(p.stage)) {
      await stopAll(row.id, prior, `stopped_${p.stage}`);
      continue;
    }
    const paid = await serviceRead<{ id: string }[]>(
      `fixit_orders?select=id&report_token=eq.${encodeURIComponent(lead.reportToken ?? "")}&limit=1`,
      "",
    );
    if (paid.data?.length) {
      await stopAll(row.id, prior, "stopped_paid");
      continue;
    }
    const contact = await findContact(lead);
    if (contact && (contact.dnd || contact.tags.some((t) => STOP_TAGS.includes(t)))) {
      await stopAll(row.id, prior, "stopped_ghl");
      continue;
    }

    const msg = followupMessage(lead, step);
    let okSend = false;
    if (step.channel === "sms" && msg.sms) {
      okSend = contact ? await sendSms(contact.id, msg.sms) : false;
      // Text failed (no GHL contact or no SMS access): fall back to email.
      if (!okSend && lead.email) {
        const r = await sendEmail({
          to: lead.email,
          subject: `Your Google Check for ${lead.business}`,
          html: `<p style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5">${msg.sms.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).replace(/ Reply STOP to opt out\.$/, "")}</p>`,
          replyTo: julius(),
        });
        okSend = r.ok;
      }
    } else if (step.channel === "email" && msg.subject && lead.email) {
      const r = await sendEmail({
        to: lead.email,
        subject: msg.subject,
        html: msg.html ?? "",
        ...(msg.text ? { text: msg.text } : {}),
        replyTo: julius(),
      });
      okSend = r.ok;
    }
    await record(row.id, step.step, step.channel, okSend ? "sent" : "failed");
    if (okSend) sent.push(`${lead.business} - step ${step.step} by ${step.channel}`);
  }

  if (sent.length) {
    const list = sent
      .map((s) => `<li>${s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</li>`)
      .join("");
    await sendEmail({
      to: julius(),
      subject: `Google Check follow-ups sent: ${sent.length}`,
      html: `<p>These free-check follow-ups just went out:</p><ul>${list}</ul><p>Replies land in the GHL inbox. Tag a contact "no-followup" to stop the sequence for them.</p>`,
    });
  }
  return { status: 200, body: { ok: true, sent: sent.length } };
}
