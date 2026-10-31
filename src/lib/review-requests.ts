// Review requests: pure helpers (messages, phone numbers, WhatsApp and text
// links, what happens after each send). Client-safe. No em dashes in copy.

export type Channel = "whatsapp" | "sms" | "email";

export const DEFAULT_MESSAGE =
  "Hi {name}, thank you for choosing {business}. Would you mind leaving us a quick review? It takes about 30 seconds and really helps: {link}";
export const DEFAULT_REMINDER =
  "Hi {name}, just a gentle reminder from {business}. If you have a moment, a quick review would mean a lot: {link} If you have already left one, thank you!";
export const DEFAULT_SUBJECT = "How was your experience with {business}?";

export function fillMessage(
  template: string,
  v: { name: string; business: string; link: string },
): string {
  const first = v.name.trim().split(/\s+/)[0] ?? "";
  return template
    .replace(/\{name\}/g, first || "there")
    .replace(/\{business\}/g, v.business)
    .replace(/\{link\}/g, v.link)
    .replace(/Hi there,/g, "Hi,")
    .replace(/—|–/g, "-")
    .trim();
}

// International digits for WhatsApp (no plus, no spaces).
// "07700 900123" with country 44 -> "447700900123"; "+234 803 123 4567" -> "2348031234567";
// "0803 123 4567" with country 234 -> "2348031234567".
export function intlDigits(phone: string, countryCode: string): string | null {
  const raw = phone.trim();
  let d = raw.replace(/[^\d]/g, "");
  if (!d) return null;
  if (raw.startsWith("+")) {
    // already international
  } else if (d.startsWith("00")) {
    d = d.slice(2);
  } else if (d.startsWith("0")) {
    d = countryCode + d.slice(1);
  } else if (!d.startsWith(countryCode) || d.length < 10) {
    d = countryCode + d;
  }
  return d.length >= 8 && d.length <= 15 ? d : null;
}

export function whatsappLink(phone: string, countryCode: string, text: string): string | null {
  const d = intlDigits(phone, countryCode);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
}

export function smsLink(phone: string, countryCode: string, text: string): string | null {
  const d = intlDigits(phone, countryCode);
  return d ? `sms:+${d}?&body=${encodeURIComponent(text)}` : null;
}

export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

// Reminder days, counted from the first ask: [reminder 1, reminder 2].
export type ReminderDays = [number, number];

// What a request looks like after one message goes out.
// step 0 = the first ask, 1 = reminder 1, 2 = reminder 2: the step is the
// message that goes next. Reminders are timed from the first ask (day 3 and
// day 7 by default). After the last allowed reminder the request is finished.
export function afterSend(
  step: number,
  maxReminders: number,
  days: ReminderDays,
  firstSentAt: Date,
  now: Date,
): { step: number; status: "waiting" | "finished"; dueAt: string } {
  const next = step + 1;
  if (next > maxReminders) return { step: next, status: "finished", dueAt: now.toISOString() };
  const offset = days[Math.min(next, 2) - 1] ?? days[0];
  const due = Math.max(firstSentAt.getTime() + offset * 86400000, now.getTime() + 3600000);
  return { step: next, status: "waiting", dueAt: new Date(due).toISOString() };
}

export interface Signals {
  clickedAt?: string | null;
  feedbackAt?: string | null;
  reviewedAt?: string | null;
  unsubscribedAt?: string | null;
  openedAt?: string | null;
}

// Strong signals: the customer acted, so no more reminders.
export function hasStopSignal(r: Signals): boolean {
  return !!(r.clickedAt || r.feedbackAt || r.reviewedAt || r.unsubscribedAt);
}

// What to do with a reminder that is due. Opening the link without clicking
// a review site is a soft signal: they saw it, so skip straight to the last
// reminder instead of sending every one.
export function reminderDecision(
  r: Signals & { step: number },
  maxReminders: number,
  days: ReminderDays,
  firstSentAt: Date | null,
  now: Date,
): { action: "send" } | { action: "finish" } | { action: "later"; step: number; dueAt: string } {
  if (r.step === 0) return { action: "send" };
  if (hasStopSignal(r) || r.step > maxReminders) return { action: "finish" };
  if (r.openedAt && r.step < maxReminders && firstSentAt) {
    const step = maxReminders;
    const due = Math.max(
      firstSentAt.getTime() + (days[step - 1] ?? days[1]) * 86400000,
      now.getTime(),
    );
    return { action: "later", step, dueAt: new Date(due).toISOString() };
  }
  return { action: "send" };
}

// ---------- quiet hours (business local time) ----------

function localParts(d: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(d)) if (x.type !== "literal") p[x.type] = Number(x.value);
  return {
    y: p["year"]!,
    m: p["month"]!,
    d: p["day"]!,
    h: p["hour"]! % 24,
    min: p["minute"]!,
    s: p["second"]!,
  };
}

function safeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return "Europe/London";
  }
}

// The instant when the local clock in `tz` reads y-m-d h:00.
function zonedTime(y: number, m: number, d: number, h: number, tz: string): Date {
  let guess = Date.UTC(y, m - 1, d, h, 0, 0);
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    guess += Date.UTC(y, m - 1, d, h, 0, 0) - asUtc;
  }
  return new Date(guess);
}

// Is the hour inside quiet hours? Handles windows that cross midnight
// (20 to 9) and ones that do not (13 to 14). Equal start and end = no quiet hours.
export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

// Move a send time out of quiet hours to the next morning (business time).
export function outOfQuietHours(at: Date, timeZone: string, start = 20, end = 9): Date {
  const tz = safeZone(timeZone);
  const p = localParts(at, tz);
  if (!inQuietHours(p.h, start, end)) return at;
  // Which local day does the quiet window end on?
  const nextDay = start > end && p.h >= start;
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d + (nextDay ? 1 : 0)));
  return zonedTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), end, tz);
}

// When a triggered request should go out: a delay after the trigger, never
// in quiet hours.
export function triggeredSendTime(
  trigger: Date,
  delayHours: number,
  timeZone: string,
  quiet: { start: number; end: number } = { start: 20, end: 9 },
): Date {
  return outOfQuietHours(
    new Date(trigger.getTime() + delayHours * 3600000),
    timeZone,
    quiet.start,
    quiet.end,
  );
}

// ---------- "don't ask again" window ----------

export const COOLDOWN_CHOICES = [60, 90, 180] as const;

export function emailKey(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return looksLikeEmail(e) ? e : null;
}

export function phoneKey(phone: string | null | undefined, countryCode: string): string | null {
  return phone ? intlDigits(phone, countryCode) : null;
}

// Was this customer (same email or phone) asked within the window?
// Skipped rows do not count as being asked.
export function askedRecently(
  customer: { email: string | null; phoneKey: string | null },
  past: { email: string | null; phone_key: string | null; status: string; created_at: string }[],
  cooldownDays: number,
  now: Date,
): boolean {
  const since = now.getTime() - cooldownDays * 86400000;
  return past.some(
    (p) =>
      p.status !== "skipped" &&
      Date.parse(p.created_at) >= since &&
      ((!!customer.email && p.email?.toLowerCase() === customer.email) ||
        (!!customer.phoneKey && p.phone_key === customer.phoneKey)),
  );
}

// ---------- Google reviewer name match ----------

function nameTokens(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/['-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

function firstMatches(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 3 && l.startsWith(s)) return true; // Jon / Jonathan
  return s.length >= 4 && editDistance(a, b) <= 1; // Jayne / Jane
}

function lastMatches(customer: string, reviewer: string): boolean {
  if (customer === reviewer) return true;
  if (reviewer.length === 1) return customer[0] === reviewer; // "Jane S."
  return Math.min(customer.length, reviewer.length) >= 4 && editDistance(customer, reviewer) <= 1;
}

// Fuzzy first + last name match between a customer and a Google reviewer.
// A first name on its own is never enough.
export function reviewerMatches(customerName: string, reviewerName: string): boolean {
  const c = nameTokens(customerName);
  const r = nameTokens(reviewerName);
  if (c.length < 2 || r.length < 2) return false;
  if (!firstMatches(c[0]!, r[0]!)) return false;
  return lastMatches(c[c.length - 1]!, r[r.length - 1]!);
}

// ---------- webhook payloads ----------

export type TriggerEvent = "job_done" | "invoice_paid" | "manual";

export interface TriggerInput {
  name: string;
  email: string | null;
  phone: string | null;
  event: TriggerEvent;
  externalId: string | null;
}

function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

// Reads JSON or form posts from GoHighLevel, Zapier, Make or anything else.
// Accepts flat keys (name, email), dotted keys (contact.first_name) and
// nested objects (contact: {...}, customData: {...}).
export function parseTriggerPayload(body: unknown): TriggerInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const flat: Record<string, unknown> = {};
  const walk = (o: Record<string, unknown>, prefix: string, depth: number) => {
    for (const [k, v] of Object.entries(o)) {
      const key = (prefix ? `${prefix}.${k}` : k).toLowerCase();
      if (v && typeof v === "object" && !Array.isArray(v) && depth < 3)
        walk(v as Record<string, unknown>, key, depth + 1);
      else flat[key] = v;
      // Nested values also count as plain keys (customData.email -> email),
      // but never override a top-level value.
      const short = k.toLowerCase();
      if (prefix && !(short in flat) && (typeof v === "string" || typeof v === "number"))
        flat[short] = v;
    }
  };
  walk(body as Record<string, unknown>, "", 0);
  const first = pick(flat, ["first_name", "firstname", "contact.first_name", "contact.firstname"]);
  const last = pick(flat, ["last_name", "lastname", "contact.last_name", "contact.lastname"]);
  const name = (
    pick(flat, [
      "name",
      "full_name",
      "fullname",
      "contact.name",
      "contact.full_name",
      "customer_name",
    ]) || `${first} ${last}`
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const email = emailKey(pick(flat, ["email", "contact.email", "customer_email", "email_address"]));
  const rawPhone = pick(flat, [
    "phone",
    "contact.phone",
    "mobile",
    "phone_number",
    "customer_phone",
  ]);
  const phone = /\d{6,}/.test(rawPhone.replace(/[^\d]/g, "")) ? rawPhone.slice(0, 30) : null;
  if (!email && !phone) return null;
  const ev = pick(flat, ["event", "trigger", "type"])
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const event: TriggerEvent =
    ev === "invoice_paid" || ev === "job_done" || ev === "manual"
      ? ev
      : /invoice|paid|payment/.test(ev)
        ? "invoice_paid"
        : /job|won|complete|done/.test(ev)
          ? "job_done"
          : "manual";
  const externalId =
    pick(flat, ["external_id", "externalid", "invoice_id", "job_id", "order_id"]).slice(0, 200) ||
    null;
  return { name, email, phone, event, externalId };
}

// ---------- what the Ask tab shows ----------

export interface ChipInput extends Signals {
  status: string;
  remindersSent: number;
  lastSentAt: string | null;
  skipReason: string | null;
}

export function requestChips(r: ChipInput): string[] {
  if (r.status === "skipped")
    return [r.skipReason === "unsubscribed" ? "Skipped: unsubscribed" : "Skipped: asked recently"];
  const out: string[] = [];
  if (r.lastSentAt) out.push("Sent");
  else if (r.status === "due") out.push("To send");
  if (r.remindersSent >= 2) out.push("Reminder 2 sent");
  else if (r.remindersSent === 1) out.push("Reminder 1 sent");
  if (r.openedAt) out.push("Opened");
  if (r.clickedAt) out.push("Clicked review link");
  if (r.feedbackAt) out.push("Left feedback");
  if (r.reviewedAt) out.push("Reviewed");
  if (r.unsubscribedAt) out.push("Unsubscribed");
  if (r.status === "stopped" && !r.unsubscribedAt) out.push("Stopped");
  return out;
}

export function last30Counts(
  rows: (ChipInput & { createdAt: string })[],
  now: Date,
): {
  sent: number;
  opened: number;
  clicked: number;
  feedback: number;
  reviewed: number;
  skipped: number;
} {
  const since = now.getTime() - 30 * 86400000;
  const recent = rows.filter((r) => Date.parse(r.createdAt) >= since);
  return {
    sent: recent.filter((r) => r.lastSentAt).length,
    opened: recent.filter((r) => r.openedAt).length,
    clicked: recent.filter((r) => r.clickedAt).length,
    feedback: recent.filter((r) => r.feedbackAt).length,
    reviewed: recent.filter((r) => r.reviewedAt).length,
    skipped: recent.filter((r) => r.status === "skipped").length,
  };
}

// One pasted line: "Jane Smith, 07700 900123" or "Jane, jane@x.com" or just a number/email.
export function parseLine(
  line: string,
): { name: string; phone: string | null; email: string | null } | null {
  const parts = line
    .split(/[,\t;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  let name = "";
  let phone: string | null = null;
  let email: string | null = null;
  for (const p of parts) {
    if (!email && looksLikeEmail(p)) email = p.toLowerCase();
    else if (!phone && /^[+\d][\d\s()-]{6,}$/.test(p)) phone = p;
    else if (!name) name = p.slice(0, 80);
  }
  return phone || email ? { name, phone, email } : null;
}

// Country calling codes offered in settings (most likely first).
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "44", name: "United Kingdom (+44)" },
  { code: "234", name: "Nigeria (+234)" },
  { code: "353", name: "Ireland (+353)" },
  { code: "1", name: "USA / Canada (+1)" },
  { code: "233", name: "Ghana (+233)" },
  { code: "254", name: "Kenya (+254)" },
  { code: "27", name: "South Africa (+27)" },
  { code: "61", name: "Australia (+61)" },
  { code: "971", name: "UAE (+971)" },
];
