// Free Google Check follow-ups: who is due which nudge, and what it says.
// Pure logic, so it can be unit tested. Sending lives in
// check-followups.server.ts.

export type FollowupLead = {
  id: string;
  name: string;
  business: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  reportToken: string | null;
  keyword: string | null;
};

export type FollowupStep = {
  step: 1 | 2 | 3;
  afterHours: number;
  channel: "sms" | "email";
};

// Day 1 text, day 3 email (text if no email), day 7 last text.
export const STEPS: FollowupStep[] = [
  { step: 1, afterHours: 20, channel: "sms" },
  { step: 2, afterHours: 72, channel: "email" },
  { step: 3, afterHours: 168, channel: "sms" },
];

// Leads older than this never start the sequence (stops a backlog blast).
export const MAX_AGE_HOURS = 24 * 10;

// Only send 9am to 7pm UK time, Monday to Saturday.
export function inSendWindow(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const day = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return day !== "Sun" && hour >= 9 && hour < 19;
}

// The next step this lead is due, or null. Steps go in order: a later step
// is only due once the earlier ones are done (sent or skipped).
export function dueStep(
  lead: Pick<FollowupLead, "createdAt" | "email" | "phone" | "reportToken">,
  done: number[],
  now: Date,
): FollowupStep | null {
  if (!lead.reportToken) return null;
  const ageH = (now.getTime() - new Date(lead.createdAt).getTime()) / 3_600_000;
  if (!Number.isFinite(ageH) || ageH < 0) return null;
  const next = STEPS.find((s) => !done.includes(s.step));
  if (!next || ageH < next.afterHours) return null;
  // A lead older than the window only continues a sequence it already began.
  if (next.step === 1 && ageH > MAX_AGE_HOURS) return null;
  const channel: FollowupStep["channel"] =
    next.channel === "email" && !lead.email
      ? "sms"
      : next.channel === "sms" && !lead.phone
        ? "email"
        : next.channel;
  if (channel === "sms" && !lead.phone) return null;
  if (channel === "email" && !lead.email) return null;
  return { ...next, channel };
}

// Gated check: the lead was asked to reply SEND and has not yet. Two short
// reminders (steps 4 and 5), then nothing. The first ask carries the opt-out
// line, so these do not repeat it.
export const SEND_REMINDERS = [
  { step: 4, afterHours: 2 },
  { step: 5, afterHours: 22 },
] as const;

export function sendReminderDue(createdAt: string, done: number[], now: Date): 4 | 5 | null {
  const ageH = (now.getTime() - new Date(createdAt).getTime()) / 3_600_000;
  if (!Number.isFinite(ageH) || ageH < 0 || ageH > 72) return null;
  const next = SEND_REMINDERS.find((r) => !done.includes(r.step));
  if (!next || ageH < next.afterHours) return null;
  return next.step;
}

export function sendReminderSms(name: string, business: string, step: 4 | 5): string {
  const who = firstName(name);
  const biz = business.trim();
  return step === 4
    ? `Hi ${who}, your free Google Check for ${biz} is ready. Just reply SEND and it's yours. Accelur8`
    : `Hi ${who}, still want to see how ${biz} shows up on Google? Reply SEND and we'll text your free report. Accelur8`;
}

export function firstName(name: string): string {
  const f = name.trim().split(/\s+/)[0] ?? "";
  return f ? f.charAt(0).toUpperCase() + f.slice(1) : "there";
}

function isCleaning(keyword: string | null, business: string): boolean {
  return /clean|maid|valet/i.test(`${keyword ?? ""} ${business}`);
}

const SITE = "https://repsuites.com";

export function followupMessage(
  lead: FollowupLead,
  step: FollowupStep,
): { sms?: string; subject?: string; html?: string; text?: string } {
  const who = firstName(lead.name);
  const biz = lead.business.trim();
  const token = encodeURIComponent(lead.reportToken ?? "");
  const report = `${SITE}/r/${token}`;
  const fix = `${SITE}/profile`;
  if (step.step === 1) {
    return {
      sms: `Hi ${who}, did you see the free Google Check you asked for? Here it is again for ${biz}: ${report} What stood out most? Accelur8`,
    };
  }
  if (step.step === 3) {
    return {
      sms: `Hi ${who}, last one from me. This short video shows how Google picks the top 3 near you, and how we fix it for ${biz}: ${fix}`,
    };
  }
  const cleaning = isCleaning(lead.keyword, biz);
  const sparkops = cleaning
    ? `<p>One more thing. If your rota, cleaners and invoices still live in WhatsApp and spreadsheets, have a look at <a href="https://ops.accelur8clientwork.com/cleaning">SparkOps</a>. It is the app we built for cleaning businesses. There is a 2-minute film and a live demo, no card needed.</p>`
    : "";
  const sparkopsText = cleaning
    ? `\n\nOne more thing. If your rota, cleaners and invoices still live in WhatsApp and spreadsheets, have a look at SparkOps, the app we built for cleaning businesses: https://ops.accelur8clientwork.com/cleaning`
    : "";
  if (step.channel === "sms") {
    return {
      sms: `Hi ${who}, quick tip for ${biz}: list each job you want more of as its own service on Google. It helps you show up for those searches. How Google picks the top 3: ${fix}`,
    };
  }
  const subject = `${biz}: the quickest way up Google Maps`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b2b34;max-width:560px">
<p>Hi ${esc(who)},</p>
<p>A few days ago you ran a free Google Check for ${esc(biz)}. Here is the quickest win from it.</p>
<p><strong>Get a few fresh reviews this week.</strong> Google favours businesses with recent reviews. Your report has a free review link and a QR code. Send the link to 3 happy clients today, it takes 2 minutes.</p>
<p><a href="${report}" style="display:inline-block;background:#0f5b66;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Open my report</a></p>
<p>Want the rest written for you? For £27 one-off we check your profile and write every missing piece, ready to copy and paste, on your WhatsApp within 30 minutes. That is about 7p a day over a year. <a href="${fix}">Watch how it works</a>.</p>
${sparkops}
<p>Any questions, just reply to this email.</p>
<p>Accelur8</p>
</div>`;
  const text = `Hi ${who},\n\nA few days ago you ran a free Google Check for ${biz}. Here is the quickest win from it.\n\nGet a few fresh reviews this week. Google favours businesses with recent reviews. Your report has a free review link and a QR code: ${report}\n\nWant the rest written for you? For £27 one-off we write every missing piece, ready to copy and paste, within 30 minutes (about 7p a day over a year): ${fix}${sparkopsText}\n\nAny questions, just reply to this email.\n\nAccelur8`;
  return { subject, html, text };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
