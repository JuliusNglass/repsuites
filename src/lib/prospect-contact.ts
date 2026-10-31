// Pure helpers for reaching a prospect: is the phone a mobile (so very likely
// on WhatsApp) or a landline, and which email address and social pages does
// their website show. Client-safe. No em dashes in copy (AGENTS.md).
//
// There is no public way to ask WhatsApp if a number is on it, so we go by
// the number itself: mobile numbers almost always are, landlines are not.

export type PhoneType = "mobile" | "landline" | "unknown" | "none";

export const PHONE_TYPE_LABEL: Record<PhoneType, string> = {
  mobile: "Mobile (WhatsApp likely)",
  landline: "Landline",
  unknown: "Phone (cannot tell)",
  none: "No phone",
};

// Calling code -> pattern for mobile numbers, written for the national number
// without the leading 0. Anything else in a listed country is a landline or
// a business line. Worked example: "+44 7700 900123" -> country 44, national
// number "7700900123", which starts with 77, so it is a UK mobile.
const MOBILE: Record<string, RegExp> = {
  // UK: 07 is mobile, except 070 (personal numbers) and 076 (pagers). 07624 is
  // an Isle of Man mobile.
  "44": /^(7[1-57-9]\d{8}|7624\d{6})$/,
  // Nigeria: 070, 071, 080, 081, 090, 091.
  "234": /^(70|71|80|81|90|91)\d{8}$/,
  // Ireland: 083, 085, 086, 087, 089.
  "353": /^8[35-9]\d{7}$/,
  // South Africa: 06x, 07x, 081 to 084.
  "27": /^(6\d|7[1-46-9]|8[1-4])\d{7}$/,
  // Ghana: 020, 023 to 029, 05x.
  "233": /^(2[03-9]|5\d)\d{7}$/,
  // Kenya: 07xx and 01xx.
  "254": /^(7\d|1[01])\d{7}$/,
  // Australia 04, New Zealand 02.
  "61": /^4\d{8}$/,
  "64": /^2\d{7,9}$/,
  // India: 6 to 9.
  "91": /^[6-9]\d{9}$/,
  // A few in Europe.
  "33": /^[67]\d{8}$/,
  "34": /^[67]\d{8}$/,
  "39": /^3\d{8,9}$/,
  "49": /^1[5-7]\d{8,9}$/,
  "31": /^6\d{8}$/,
};

// Calling codes we know, longest first so "+234" is not read as "+23".
const CODES = [...Object.keys(MOBILE), "1"].sort((a, b) => b.length - a.length);

// Where we have no rule and the number is not international, guess the
// country from where the business is. Country name or ISO code -> calling code.
const COUNTRY_CODE: Record<string, string> = {
  uk: "44",
  gb: "44",
  "united kingdom": "44",
  ng: "234",
  nigeria: "234",
  ie: "353",
  ireland: "353",
  za: "27",
  "south africa": "27",
  gh: "233",
  ghana: "233",
  ke: "254",
  kenya: "254",
  au: "61",
  australia: "61",
  nz: "64",
  "new zealand": "64",
  in: "91",
  india: "91",
  us: "1",
  usa: "1",
  ca: "1",
  canada: "1",
};

// The calling code for a country name or code, or "" if we do not know it.
export function callingCode(country: string): string {
  return COUNTRY_CODE[country.trim().toLowerCase()] ?? "";
}

// The country at the end of a Google address: "1 High St, Newport NP20 1AA, UK" -> "UK".
export function addressCountry(address: string): string {
  const parts = address.split(",").map((s) => s.trim());
  return parts[parts.length - 1] ?? "";
}

// Splits a phone number into its calling code and national number.
export function splitPhone(phone: string, country = ""): { code: string; national: string } | null {
  const raw = phone.trim();
  if (!raw) return null;
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (raw.startsWith("+") || digits.startsWith("00")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    const code = CODES.find((c) => digits.startsWith(c));
    if (!code) return { code: "", national: digits };
    // Some countries print a (0) after the code: +44 (0)7700 ...
    return { code, national: digits.slice(code.length).replace(/^0/, "") };
  }
  const code = callingCode(country);
  // US and Canada numbers have no leading 0.
  return { code, national: code === "1" ? digits : digits.replace(/^0/, "") };
}

// Mobile, landline, cannot tell (no rule for that country, or the USA and
// Canada where mobiles and landlines look the same), or no phone at all.
export function phoneType(phone: string | null | undefined, country = ""): PhoneType {
  if (!phone || !phone.replace(/[^\d]/g, "")) return "none";
  const s = splitPhone(phone, country);
  if (!s || !s.code) return "unknown";
  const rule = MOBILE[s.code];
  if (!rule) return "unknown";
  return rule.test(s.national) ? "mobile" : "landline";
}

// The number in the form wa.me wants: digits only, with the calling code.
export function waNumber(phone: string, country = ""): string {
  const s = splitPhone(phone, country);
  return s?.code ? `${s.code}${s.national}` : "";
}

// ---------- emails and social pages on a website ----------

export interface SiteContacts {
  emails: string[];
  facebook: string;
  instagram: string;
  // A likely contact page on the same site, to look at next.
  contactUrl: string;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,200}\.[A-Za-z]{2,24}/g;

// Placeholder or tracking addresses that are never the business.
const JUNK_DOMAINS = [
  "example.com",
  "example.org",
  "example.co.uk",
  "domain.com",
  "yourdomain.com",
  "email.com",
  "mail.com",
  "website.com",
  "company.com",
  "sentry.io",
  "sentry-next.wixpress.com",
  "sentry.wixpress.com",
  "wixpress.com",
  "wix.com",
  "squarespace.com",
  "godaddy.com",
  "wordpress.com",
  "wordpress.org",
  "w3.org",
  "schema.org",
  "ingest.sentry.io",
  "mysite.com",
  "yoursite.com",
  "sitename.com",
  "test.com",
];
const JUNK_USERS =
  /^(you|your|yourname|name|firstname|first\.last|user|username|email|test|someone|john|jane|johndoe|john\.doe|example|me|abc|xyz)$/i;
const FILE_END =
  /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|css|js|mjs|json|woff2?|ttf|eot|mp4|webm|pdf)$/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
}

// Cloudflare hides emails as a hex string: the first byte is the key, every
// other byte is a letter XOR the key.
export function decodeCfEmail(hex: string): string {
  if (!/^[0-9a-f]{4,400}$/i.test(hex) || hex.length % 2) return "";
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2)
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

// True for a real looking address (not a picture name, tracker or placeholder).
export function goodEmail(e: string): boolean {
  const email = e.toLowerCase();
  if (email.length > 254 || FILE_END.test(email)) return false;
  const [user, domain] = email.split("@");
  if (!user || !domain || JUNK_USERS.test(user)) return false;
  if (/^[0-9a-f]{20,}$/.test(user)) return false; // tracking ids
  if (domain.startsWith(".") || domain.includes("..")) return false;
  if (JUNK_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return false;
  if (/@\d+x\./.test(email)) return false; // logo@2x.png
  return true;
}

function cleanEmail(e: string): string {
  return e
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^[.\-_]+|[.\-_]+$/g, "")
    .toLowerCase();
}

function absolute(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

// Picks a page link we trust: an http(s) Facebook page, not a share button,
// a plugin or the platform's own pages.
function socialLink(html: string, host: RegExp, skip: RegExp): string {
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1]!).trim();
    let u: URL;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || !host.test(u.hostname)) continue;
    const path = u.pathname.replace(/\/+$/, "");
    if (!path || path === "/" || skip.test(path)) continue;
    return `https://${u.hostname.replace(/^(m|web|mobile)\./, "www.")}${path}`.slice(0, 300);
  }
  return "";
}

// Reads one web page for emails, a contact page link and Facebook/Instagram links.
export function extractContacts(html: string, pageUrl: string): SiteContacts {
  const found: string[] = [];
  const add = (raw: string) => {
    const e = cleanEmail(raw);
    const m = e.match(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/);
    if (m && goodEmail(e) && !found.includes(e)) found.push(e);
  };
  // 1. mailto: links (the best signal).
  const mailRe = /href\s*=\s*["']\s*mailto:([^"'?]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mailRe.exec(html))) {
    let v = decodeEntities(m[1]!);
    try {
      v = decodeURIComponent(v);
    } catch {
      // keep as is
    }
    for (const part of v.split(/[,;]/)) add(part);
  }
  // 2. Cloudflare-protected emails.
  const cfRe = /data-cfemail\s*=\s*["']([0-9a-fA-F]+)["']/g;
  while ((m = cfRe.exec(html))) add(decodeCfEmail(m[1]!));
  const cfHref = /\/cdn-cgi\/l\/email-protection#([0-9a-fA-F]+)/g;
  while ((m = cfHref.exec(html))) add(decodeCfEmail(m[1]!));
  // 3. Visible text (scripts and styles removed), including "name [at] site [dot] com".
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@")
    .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".");
  for (const e of text.match(EMAIL_RE) ?? []) add(e);

  // A contact page on the same site: /contact, /contact-us, or a link whose
  // words say contact.
  let contactUrl = "";
  let host = "";
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    // no base
  }
  const linkRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi;
  const candidates: { url: string; score: number }[] = [];
  while ((m = linkRe.exec(html))) {
    const href = decodeEntities(m[1]!).trim();
    if (/^(mailto|tel|javascript|#)/i.test(href)) continue;
    const url = absolute(href, pageUrl);
    if (!url) continue;
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    if (u.hostname.replace(/^www\./, "") !== host) continue;
    const path = u.pathname.toLowerCase();
    const words = m[2]!.replace(/<[^>]+>/g, " ").toLowerCase();
    let score = 0;
    if (/^\/contact(-us)?\/?$/.test(path)) score = 3;
    else if (/contact/.test(path)) score = 2;
    else if (/contact|get in touch|enquir/.test(words)) score = 1;
    if (score) candidates.push({ url: `${u.origin}${u.pathname}`, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  contactUrl = candidates[0]?.url ?? "";

  return {
    emails: found.slice(0, 10),
    facebook: socialLink(
      html,
      /(^|\.)facebook\.com$/i,
      /^\/(sharer|share|dialog|plugins|tr|login|privacy|policies|help|groups\/?$)/i,
    ),
    instagram: socialLink(
      html,
      /(^|\.)instagram\.com$/i,
      /^\/(p|reel|reels|explore|accounts|about|legal|developer)(\/|$)/i,
    ),
    contactUrl,
  };
}

// Common shared inboxes, best first.
const ROLE_ORDER = [
  "info",
  "hello",
  "contact",
  "enquiries",
  "enquiry",
  "office",
  "admin",
  "bookings",
  "booking",
  "sales",
  "mail",
];
const BAD_ROLE =
  /^(no-?reply|do-?not-?reply|privacy|gdpr|dpo|abuse|postmaster|webmaster|careers|jobs|recruitment|accounts|invoices|billing)$/;

// The site's own domain, without www: "https://www.bobsplumbing.co.uk/x" -> "bobsplumbing.co.uk".
export function siteDomain(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Orders the emails found, best first: same domain as the website first, then
// shared inboxes like info@ and hello@, then personal names, then the rest.
// Gmail and other free addresses still count (many sole traders use them).
export function rankEmails(emails: string[], website: string): string[] {
  const domain = siteDomain(website);
  const score = (e: string) => {
    const [user = "", d = ""] = e.split("@");
    let s = 0;
    if (domain && (d === domain || d.endsWith(`.${domain}`) || domain.endsWith(`.${d}`))) s += 100;
    else if (/^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|aol|btinternet|sky)\./.test(d))
      s += 40;
    const role = ROLE_ORDER.indexOf(user);
    if (role >= 0) s += 30 - role;
    else if (/^[a-z]+(\.[a-z]+)?$/.test(user)) s += 10; // a person's name
    if (BAD_ROLE.test(user)) s = -1000;
    return s;
  };
  return [...new Set(emails)]
    .map((e, i) => ({ e, s: score(e), i }))
    .filter((x) => x.s > -100)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.e);
}

// Results of the email finder older than this are looked at again.
export const CONTACT_RECHECK_DAYS = 30;

export function contactsFresh(foundAt: string | null | undefined, now = Date.now()): boolean {
  if (!foundAt) return false;
  const t = Date.parse(foundAt);
  return Number.isFinite(t) && now - t < CONTACT_RECHECK_DAYS * 86400000;
}

// Filter chips on the search results.
export type ReachFilter = "all" | "whatsapp" | "email" | "either";

export function matchesReach(h: { phoneType: PhoneType; email: string }, f: ReachFilter): boolean {
  const wa = h.phoneType === "mobile";
  const em = !!h.email;
  if (f === "whatsapp") return wa;
  if (f === "email") return em;
  if (f === "either") return wa || em;
  return true;
}

// Which country a prospect search is about. Most are UK, so UK is the
// default: Google is told to prefer UK results and anything abroad is dropped
// ("Newport" also matches Newport, Oregon). Naming Nigeria or a big Nigerian
// city searches there; naming another country turns the filter off.
const NG_WORDS =
  /\b(nigeria|lagos|abuja|ibadan|kano|enugu|port harcourt|benin city|owerri|uyo|calabar|abeokuta|ikeja|lekki|warri|jos|kaduna)\b/i;
const OTHER_WORDS =
  /\b(usa|united states|america|canada|ireland|dublin|south africa|ghana|accra|kenya|nairobi|australia|new zealand|india|france|spain|italy|germany|netherlands|oregon|rhode island|new york|california|texas)\b/i;

export function searchRegion(query: string): { code: string | null; keep: string[] | null } {
  if (NG_WORDS.test(query)) return { code: "NG", keep: ["Nigeria"] };
  if (OTHER_WORDS.test(query)) return { code: null, keep: null };
  return { code: "GB", keep: ["UK", "United Kingdom"] };
}
