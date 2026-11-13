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
  const fix = `${SITE}/fix?r=${token}`;
  if (step.step === 1) {
    return {
      sms: `Hi ${who}, did you get a chance to look at your Google Check for ${biz}? The fixes at the top are the quickest wins: ${report} Want us to write them all for you? £27 one-off: ${fix} - Accelur8. Reply STOP to opt out.`,
    };
  }
  if (step.step === 3) {
    return {
      sms: `Hi ${who}, one last nudge on ${biz}'s Google Check. We can write every fix for you for £27, about 90p a day for a month: ${fix} Or just reply with any question. - Accelur8. Reply STOP to opt out.`,
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
      sms: `Hi ${who}, a quick tip from your Google Check for ${biz}: fresh reviews help you show up first. Your free review link and QR code are in your report: ${report} Want us to write the rest of the fixes? £27 one-off: ${fix} - Accelur8. Reply STOP to opt out.`,
    };
  }
  const subject = `${biz}: the quickest way up Google Maps`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b2b34;max-width:560px">
<p>Hi ${esc(who)},</p>
<p>A few days ago you ran a free Google Check for ${esc(biz)}. Here is the quickest win from it.</p>
<p><strong>Get a few fresh reviews this week.</strong> Google favours businesses with recent reviews. Your report has a free review link and a QR code. Send the link to 3 happy clients today, it takes 2 minutes.</p>
<p><a href="${report}" style="display:inline-block;background:#0f5b66;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Open my report</a></p>
<p>Want the rest done for you? We write every fix from your report, ready to copy into Google, for £27 one-off. That is about 90p a day for a month. <a href="${fix}">See what you get</a>.</p>
${sparkops}
<p>Any questions, just reply to this email.</p>
<p>Accelur8</p>
</div>`;
  const text = `Hi ${who},\n\nA few days ago you ran a free Google Check for ${biz}. Here is the quickest win from it.\n\nGet a few fresh reviews this week. Google favours businesses with recent reviews. Your report has a free review link and a QR code: ${report}\n\nWant the rest done for you? We write every fix from your report for £27 one-off, about 90p a day for a month: ${fix}${sparkopsText}\n\nAny questions, just reply to this email.\n\nAccelur8`;
  return { subject, html, text };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
