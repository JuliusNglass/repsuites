// "Ask past customers" campaigns: pure helpers. Reading a CSV or pasted list,
// sorting it into who can be asked (and why not), the gentle send rate, and
// the automatic stop on too many bounces or unsubscribes. Client-safe.
// No em dashes in copy.
import { askedRecently, emailKey, looksLikeEmail, phoneKey } from "./review-requests";

export const CAMPAIGN_MAX = 2000;
export const RATE_MIN = 10;
export const RATE_MAX = 100;
export const RATE_DEFAULT = 25;

export const CAMPAIGN_MESSAGE =
  "Hi {name}, you used {business} a while back and we hope all is well. If you have a minute, would you leave us a quick review? It really helps a small business like ours: {link}";
export const CAMPAIGN_SUBJECT = "A quick favour from {business}";

export interface Contact {
  name: string;
  email: string | null;
  phone: string | null;
  lastJobDate: string | null; // YYYY-MM-DD
}

// ---------- CSV ----------

// Splits CSV text into rows of cells. Handles quoted cells ("Smith, Jane"),
// doubled quotes, CRLF and a byte order mark. Also accepts tabs or semicolons
// when the first line has no commas.
export function csvRows(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = firstLine.includes(",")
    ? ","
    : firstLine.includes("\t")
      ? "\t"
      : firstLine.includes(";")
        ? ";"
        : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell.trim() !== "" || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

const HEADER: Record<keyof Contact | "first" | "last", RegExp> = {
  name: /^(full ?name|name|customer|customer ?name|client|client ?name|contact ?name)$/,
  first: /^(first ?name|forename|given ?name)$/,
  last: /^(last ?name|surname|family ?name)$/,
  email: /^(e-?mail|e-?mail ?address|email ?address)$/,
  phone: /^(phone|mobile|mobile ?number|phone ?number|telephone|tel|cell|whatsapp)$/,
  lastJobDate:
    /^(last ?job ?date|last ?job|date|job ?date|last ?visit|last ?service|last ?booking)$/,
};

// Turns a date cell into YYYY-MM-DD. Accepts 2025-03-14, 14/03/2025 (UK
// order) and 14-03-2025. Anything else is ignored.
export function parseDate(s: string): string | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t)))
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3]!.length === 2 ? `20${r[3]}` : r[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const looksLikePhone = (s: string) => /^[+\d][\d\s().-]{6,}$/.test(s.trim());

// A CSV (with or without a header row) or a pasted list, one customer per
// line. Lines with no email and no phone are counted as unreadable.
export function parseContacts(text: string): { contacts: Contact[]; unreadable: number } {
  const rows = csvRows(text);
  if (!rows.length) return { contacts: [], unreadable: 0 };
  const head = rows[0]!.map((h) =>
    h
      .toLowerCase()
      .replace(/[_\s]+/g, " ")
      .trim(),
  );
  const col = (k: keyof typeof HEADER) => head.findIndex((h) => HEADER[k].test(h));
  const map = {
    name: col("name"),
    first: col("first"),
    last: col("last"),
    email: col("email"),
    phone: col("phone"),
    lastJobDate: col("lastJobDate"),
  };
  const hasHeader = map.email >= 0 || map.phone >= 0;
  const contacts: Contact[] = [];
  let unreadable = 0;
  for (const r of hasHeader ? rows.slice(1) : rows) {
    let c: Contact;
    if (hasHeader) {
      const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
      const email = get(map.email);
      const phone = get(map.phone);
      c = {
        name: (get(map.name) || `${get(map.first)} ${get(map.last)}`).replace(/\s+/g, " ").trim(),
        email: email ? email.toLowerCase() : null,
        phone: phone && looksLikePhone(phone) ? phone : null,
        lastJobDate: parseDate(get(map.lastJobDate)),
      };
    } else {
      c = { name: "", email: null, phone: null, lastJobDate: null };
      for (const cell of r) {
        if (!c.email && cell.includes("@")) c.email = cell.toLowerCase();
        else if (!c.phone && looksLikePhone(cell) && !parseDate(cell)) c.phone = cell;
        else if (!c.lastJobDate && parseDate(cell)) c.lastJobDate = parseDate(cell);
        else if (!c.name) c.name = cell;
      }
    }
    c.name = c.name.slice(0, 80);
    if (c.phone) c.phone = c.phone.slice(0, 30);
    if (!c.email && !c.phone) unreadable++;
    else contacts.push(c);
  }
  return { contacts, unreadable };
}

// ---------- preview: who can be asked ----------

export interface PreviewCounts {
  rows: number; // customers read from the list
  validEmails: number; // ready, by email
  phoneOnly: number; // ready, phone only (one tap WhatsApp or text)
  badEmails: number; // email that does not look right and no phone
  duplicates: number; // the same email or phone twice in the list
  askedRecently: number; // asked within the "don't ask again" window
  unsubscribed: number;
  overCap: number; // beyond the 2,000 limit
  ready: number;
}

export function classifyContacts(
  contacts: Contact[],
  ctx: {
    countryCode: string;
    cooldownDays: number;
    past: { email: string | null; phone_key: string | null; status: string; created_at: string }[];
    optedOut: Set<string>;
    now: Date;
  },
): { ready: Contact[]; counts: PreviewCounts } {
  const counts: PreviewCounts = {
    rows: contacts.length,
    validEmails: 0,
    phoneOnly: 0,
    badEmails: 0,
    duplicates: 0,
    askedRecently: 0,
    unsubscribed: 0,
    overCap: 0,
    ready: 0,
  };
  const seen = new Set<string>();
  const ready: Contact[] = [];
  for (const c of contacts) {
    const email = c.email && looksLikeEmail(c.email) ? emailKey(c.email) : null;
    const pk = phoneKey(c.phone, ctx.countryCode);
    if (!email && !pk) {
      counts.badEmails++;
      continue;
    }
    const keys = [email, pk].filter((k): k is string => !!k);
    if (keys.some((k) => seen.has(k))) {
      counts.duplicates++;
      continue;
    }
    keys.forEach((k) => seen.add(k));
    if (keys.some((k) => ctx.optedOut.has(k))) {
      counts.unsubscribed++;
      continue;
    }
    if (askedRecently({ email, phoneKey: pk }, ctx.past, ctx.cooldownDays, ctx.now)) {
      counts.askedRecently++;
      continue;
    }
    if (ready.length >= CAMPAIGN_MAX) {
      counts.overCap++;
      continue;
    }
    ready.push({ ...c, email, phone: pk ? c.phone : null });
    if (email) counts.validEmails++;
    else counts.phoneOnly++;
  }
  counts.ready = ready.length;
  return { ready, counts };
}

// ---------- the gentle send rate ----------

export function clampRate(n: number): number {
  if (!Number.isFinite(n)) return RATE_DEFAULT;
  return Math.max(RATE_MIN, Math.min(RATE_MAX, Math.round(n)));
}

// How many more customers to queue right now. The day's rate is spread
// evenly over the hours outside quiet hours (never more than its share in any
// hour), and never more than the daily rate in any 24 hours.
export function campaignQuota(x: {
  dailyRate: number;
  queuedLast24h: number;
  queuedLastHour: number;
  localHour: number;
  quietStart: number;
  quietEnd: number;
}): number {
  const rate = clampRate(x.dailyRate);
  const quiet = (h: number) =>
    x.quietStart === x.quietEnd
      ? false
      : x.quietStart < x.quietEnd
        ? h >= x.quietStart && h < x.quietEnd
        : h >= x.quietStart || h < x.quietEnd;
  if (quiet(x.localHour)) return 0;
  const openHours = Array.from({ length: 24 }, (_, h) => h).filter((h) => !quiet(h)).length || 24;
  const perHour = Math.ceil(rate / openHours);
  return Math.max(0, Math.min(rate - x.queuedLast24h, perHour - x.queuedLastHour));
}

// ---------- automatic stop ----------

// Checked on the last 24 hours. Small numbers are judged as if at least 50
// had been sent, so one early bounce does not stop a campaign.
export function campaignStopReason(x: {
  sent: number;
  bounced: number;
  unsubscribed: number;
}): string | null {
  const base = Math.max(x.sent, 50);
  if (x.bounced / base > 0.05)
    return `Stopped automatically: ${x.bounced} emails bounced in a day (more than 5 in every 100). The list may be old. Check the email addresses before starting again.`;
  if (x.unsubscribed / base > 0.02)
    return `Stopped automatically: ${x.unsubscribed} people unsubscribed in a day (more than 2 in every 100). Check the list only has customers who will remember you.`;
  return null;
}

export interface CampaignProgress {
  total: number;
  waiting: number;
  queued: number;
  sent: number;
  clicked: number;
  reviewed: number;
  skipped: number;
}

export function progressOf(
  total: number,
  waiting: number,
  rows: {
    status: string;
    first_sent_at: string | null;
    clicked_at: string | null;
    reviewed_at: string | null;
  }[],
): CampaignProgress {
  return {
    total,
    waiting,
    queued: rows.filter((r) => r.status !== "skipped").length,
    sent: rows.filter((r) => r.first_sent_at).length,
    clicked: rows.filter((r) => r.clicked_at).length,
    reviewed: rows.filter((r) => r.reviewed_at).length,
    skipped: rows.filter((r) => r.status === "skipped").length,
  };
}
