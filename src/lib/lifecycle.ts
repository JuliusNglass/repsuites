// Customer follow-ups: pure rules. Which email (if any) a business should get
// today, and what it says. Client-safe, no server imports.
// Plain British English for owners. No em dashes in this copy (AGENTS.md).

export type EmailType =
  | "past_due"
  | "winback_30"
  | "nudge_7"
  | "connect_google"
  | "print_qr"
  | "growth_upsell"
  | "stand_upsell_paid";

export interface Facts {
  tenant_id: string;
  name: string;
  created_at: string;
  plan: string;
  billing_status: string | null;
  legacy: boolean;
  self_serve: boolean;
  owner_email: string | null;
  owner_name: string | null;
  email_confirmed: boolean;
  last_seen_at: string | null;
  unsubscribed: boolean;
  unsub_token: string | null;
  google_connected: boolean;
  scans_total: number;
  scans_7d: number;
  feedback_total: number;
  feedback_7d: number;
  requests_sent: number;
  replies_total: number;
  orders_paid: number;
}

export interface Sent {
  type: string;
  sent_at: string;
}

const DAY = 86_400_000;
// Sign-ins were not recorded before this date, so nobody counts as "quiet"
// from before it.
export const TRACKING_SINCE = "2026-10-31T00:00:00Z";

const daysSince = (iso: string, now: Date) => (now.getTime() - Date.parse(iso)) / DAY;

// Paid through Stripe (not a business Accelur8 manages for free).
export function isPaying(f: Facts): boolean {
  return f.plan !== "free" && !!f.billing_status;
}

// Who may get follow-up emails at all: real businesses that signed up
// themselves or pay us, with a confirmed owner email, not unsubscribed.
export function eligible(f: Facts): boolean {
  if (/test/i.test(f.name)) return false;
  if (!f.owner_email || !f.email_confirmed || f.unsubscribed) return false;
  if (f.legacy && !isPaying(f)) return false;
  return f.self_serve || isPaying(f);
}

// Days since the owner or team last opened the app.
export function quietDays(f: Facts, now: Date): number {
  const since = [f.last_seen_at, f.created_at, TRACKING_SINCE]
    .filter((x): x is string => !!x)
    .map((x) => Date.parse(x))
    .reduce((a, b) => Math.max(a, b), 0);
  return (now.getTime() - since) / DAY;
}

// The one email to send today, or null. At most one email every 3 days, and
// each type once (a late payment can be chased again after 30 days).
export function nextEmail(f: Facts, sent: Sent[], now: Date): EmailType | null {
  if (!eligible(f)) return null;
  const last = sent.reduce((m, s) => Math.max(m, Date.parse(s.sent_at)), 0);
  if (last && now.getTime() - last < 3 * DAY) return null;
  const had = (t: EmailType) => sent.some((s) => s.type === t);
  const hadWithin = (t: EmailType, days: number) =>
    sent.some((s) => s.type === t && daysSince(s.sent_at, now) < days);
  const age = daysSince(f.created_at, now);
  const quiet = quietDays(f, now);
  const paying = isPaying(f);
  const free = f.plan === "free";

  if (paying && f.billing_status === "past_due" && !hadWithin("past_due", 30)) return "past_due";
  if (quiet >= 30 && !had("winback_30")) return "winback_30";
  if (quiet >= 7 && quiet < 30 && !had("nudge_7")) return "nudge_7";
  if (free) {
    if (age >= 2 && !f.google_connected && !had("connect_google")) return "connect_google";
    if (age >= 3 && f.scans_total === 0 && !had("print_qr")) return "print_qr";
    if (
      age >= 7 &&
      age < 11 &&
      (f.scans_total > 0 || f.feedback_total > 0) &&
      !had("growth_upsell")
    )
      return "growth_upsell";
  }
  if (paying && f.scans_7d > 0 && f.orders_paid === 0 && !had("stand_upsell_paid"))
    return "stand_upsell_paid";
  return null;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;

// The most useful single number from their account, in plain words.
export function oneNumber(f: Facts): string {
  if (f.scans_7d > 0)
    return `${n(f.scans_7d, "person", "people")} scanned your review code in the last week.`;
  if (f.scans_total > 0)
    return `${n(f.scans_total, "person has", "people have")} scanned your review code so far.`;
  if (f.feedback_total > 0)
    return `You have ${n(f.feedback_total, "private message", "private messages")} from customers in your dashboard.`;
  if (f.replies_total > 0)
    return `You have replied to ${n(f.replies_total, "Google review", "Google reviews")} with RepSuites.`;
  return "Your review page and QR code are ready whenever you are.";
}

export interface Email {
  subject: string;
  html: string;
}

const DASH = "https://repsuites.com/dashboard";

function button(href: string, text: string): string {
  return `<p style="margin:20px 0"><a href="${href}" style="background:#f5b324;color:#0f172a;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px;display:inline-block">${text}</a></p>`;
}

// Home-service trades meet customers at their door, not at a till.
export function isHomeService(name: string): boolean {
  return /clean|maid|carpet|valet|detail|plumb|heat|electric|garden|landscap|window|gutter|roof|build|decor|paint|handy|repair|removal|pest|lock|drain|pool|dog|groom|tutor|mobile/i.test(
    name,
  );
}

// The email for a business, with the unsubscribe link at the bottom.
// One job and one button per email; every email offers to do it for them.
export function emailFor(type: EmailType, f: Facts, unsubUrl: string): Email {
  const first = (f.owner_name ?? "").split(/\s+/)[0] || "there";
  const biz = esc(f.name);
  const home = isHomeService(f.name);
  const hi = `<p>Hi ${esc(first)},</p>`;
  const help = `<p>No time, or not sure where to start? Just reply "help" and we will set it up with you.</p>`;
  const sign = `${help}<p>Julius<br>RepSuites, by Accelur8</p>`;
  const foot = `<p style="font-size:14px;color:#64748b;margin-top:24px">You get these tips because ${biz} has a RepSuites account. <a href="${unsubUrl}" style="color:#64748b">Stop these emails</a>.</p>`;
  const wrap = (subject: string, body: string): Email => ({
    subject,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#0f172a;max-width:560px">${hi}${body}${sign}${foot}</div>`,
  });
  const steps = (xs: string[]) =>
    `<ol>${xs.map((x) => `<li style="margin:0 0 6px">${x}</li>`).join("")}</ol>`;
  switch (type) {
    case "connect_google":
      return wrap(
        `See how many people find ${f.name} on Google`,
        `<p>Google counts how many people saw ${biz}, called you and asked for directions. Here is how to see it in 3 steps:</p>
${steps(["Open Settings and press <b>Connect Google</b>.", "Sign in with the Google account you use for your business.", "Press <b>Allow</b>. Your numbers appear on the Results tab."])}
${button(`${DASH}#settings`, "Connect Google")}
<p>Not sure which Google account it is? Reply and we will find it for you.</p>`,
      );
    case "print_qr":
      return home
        ? wrap(
            `The easiest way to get reviews after each job`,
            `<p>Customers are happiest the moment you finish the job. That is the time to ask. Your review code makes it one tap:</p>
${steps(["Open the <b>QR card</b> tab.", "Press <b>Download</b>, then save it to your phone or print it.", "Show it at the end of each job, or add it to your invoice."])}
${button(`${DASH}#qr`, "Get my review code")}
<p>Happy customers go to Google. Unhappy ones can message you privately first.</p>`,
          )
        : wrap(
            `Your review QR code for ${f.name} is ready to print`,
            `<p>Your review page is set up. The quickest win is to put your code where customers pay:</p>
${steps(["Open the <b>QR card</b> tab.", "Press <b>Download</b> and print it.", "Put it by the till, on tables or on receipts."])}
${button(`${DASH}#qr`, "Get my review code")}
<p>Happy customers go to Google. Unhappy ones can message you privately first.</p>`,
          );
    case "growth_upsell": {
      const what =
        f.scans_total > 0
          ? `${n(f.scans_total, "person has", "people have")} scanned your code`
          : `${n(f.feedback_total, "customer has", "customers have")} sent you a private message`;
      return wrap(
        `${f.name}: ${what} already`,
        `<p>Good start: ${what} since you joined RepSuites.</p>
<p>Most of your past customers will never see your code. RepSuites Growth asks them for you, by text or email, after each job, and only sends the happy ones to Google.</p>
<p>It also writes a reply to every Google review for you to approve, and shows where you appear on Google Maps.</p>
<p>It is £49 a month, about £1.61 a day. One extra customer a month more than pays for it. Cancel any time.</p>
${button("https://repsuites.com/pricing", "Start RepSuites Growth")}
<p>Rather we set it up with you? Reply "call" and we will book 10 minutes.</p>`,
      );
    }
    case "nudge_7":
      return wrap(
        `${first}, you are one step from your first review request`,
        `<p>${esc(oneNumber(f))}</p>
<p>${f.google_connected ? "Your next step: get your review code in front of customers. It takes about a minute." : "Your next step: connect your Google profile. It takes about a minute."}</p>
${button(f.google_connected ? `${DASH}#qr` : `${DASH}#settings`, f.google_connected ? "Get my review code" : "Connect Google")}`,
      );
    case "winback_30":
      return wrap(
        `Still want more Google reviews for ${f.name}?`,
        `<p>It has been a month since you last opened RepSuites. ${esc(oneNumber(f))}</p>
<p>If reviews are still on your list, the fastest way is to let us set it up with you. It takes about 10 minutes.</p>
${button(DASH, "Open my account")}
<p>Not for you any more? Reply "close" and we will close your account. No hard feelings.</p>`,
      );
    case "stand_upsell_paid":
      return wrap(
        `Customers are scanning your code. Make it easier.`,
        `<p>${esc(oneNumber(f))} That is great.</p>
${
  home
    ? `<p>A tap-to-review card makes it even easier at the end of a job: the customer taps it with their phone and leaves a review. Cards start at £15.</p>`
    : `<p>A proper table stand or a tap-to-review card makes it even easier, so more people do it. Stands are £29, or 2 for £49. Cards start at £15.</p>`
}${button("https://repsuites.com/cards", home ? "See tap cards" : "See stands and cards")}`,
      );
    case "past_due":
      return wrap(
        `Your RepSuites payment did not go through`,
        `<p>We could not take your last payment for ${biz}. Nothing has been switched off yet.</p>
<p>Please sign in and update your card under Settings, then Manage or cancel plan.</p>${button(`${DASH}#settings`, "Update my card")}`,
      );
  }
}
