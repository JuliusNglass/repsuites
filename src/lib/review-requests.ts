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

// What a request looks like after one message goes out.
// step 0 = the first ask; each send moves to the next step. After the last
// allowed reminder the request is finished.
export function afterSend(
  step: number,
  maxReminders: number,
  reminderDays: number,
  now: Date,
): { step: number; status: "waiting" | "finished"; dueAt: string } {
  const next = step + 1;
  if (next > maxReminders) return { step: next, status: "finished", dueAt: now.toISOString() };
  return {
    step: next,
    status: "waiting",
    dueAt: new Date(now.getTime() + reminderDays * 86400000).toISOString(),
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
