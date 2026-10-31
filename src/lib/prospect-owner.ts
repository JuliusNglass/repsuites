// Who owns a prospect's business: pure helpers (client-safe).
//
// Companies House gives the active directors of a registered company. We
// find the company by name and only trust it when the registered office is in
// the same postcode area as the Google address. A business's own website may
// also name its owner ("Hi, I'm Dave", "Founder: Sarah Jones"); that is a
// weaker hint and kept apart. Google reviews are never used: they often name
// staff, not the owner.
import { sameBusiness } from "./ai-visibility";

export interface Officer {
  name: string; // as Companies House gives it: "SMITH, John Michael"
  role: string; // director, llp-member or llp-designated-member
  appointed: string; // YYYY-MM-DD or ""
}

export type OwnerMatch = "postcode match" | "name only";

export const OWNER_RECHECK_DAYS = 90;

export function ownerFresh(at: string | null | undefined, now = Date.now()): boolean {
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && now - t < OWNER_RECHECK_DAYS * 86400000;
}

// "O'BRIEN-SMITH" -> "O'Brien-Smith", "MCDONALD" -> "McDonald".
function titleWord(w: string): string {
  const lower = w.toLowerCase();
  let out = lower.replace(/(^|[-'’])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
  out = out.replace(/^Mc([a-z])/, (_m, c: string) => `Mc${c.toUpperCase()}`);
  return out;
}

const HONORIFIC = /^(mr|mrs|ms|miss|dr|sir|dame|lady|lord|prof|professor|rev)\.?$/i;

// "SMITH, John Michael" -> { first: "John", last: "Smith" }. Names without a
// comma are left as they are (title-cased).
export function splitOfficerName(raw: string): { first: string; last: string } {
  const s = raw.replace(/\s+/g, " ").trim();
  const comma = s.indexOf(",");
  if (comma < 0) {
    const words = s.split(" ").filter((w) => w && !HONORIFIC.test(w));
    return {
      first: words.length > 1 ? titleWord(words[0]!) : "",
      last: words.length ? titleWord(words[words.length - 1]!) : "",
    };
  }
  const last = s.slice(0, comma).trim().split(" ").filter(Boolean).map(titleWord).join(" ");
  const forenames = s
    .slice(comma + 1)
    .trim()
    .split(" ")
    .filter((w) => w && !HONORIFIC.test(w));
  return { first: forenames[0] ? titleWord(forenames[0]) : "", last };
}

// "SMITH, John Michael" -> "John Smith".
export function officerDisplayName(raw: string): string {
  const { first, last } = splitOfficerName(raw);
  return [first, last].filter(Boolean).join(" ");
}

// The first UK postcode in a piece of text, tidied: "np20 1aa" -> "NP20 1AA".
const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
export function ukPostcode(text: string): string {
  const m = (text ?? "").match(POSTCODE_RE);
  return m ? `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}` : "";
}

// "NP20 1AA" -> "NP20". Also accepts just an outward code.
export function outwardCode(postcode: string): string {
  const full = ukPostcode(postcode);
  if (full) return full.split(" ")[0]!;
  const m = (postcode ?? "")
    .trim()
    .toUpperCase()
    .match(/^([A-Z]{1,2}\d[A-Z\d]?)$/);
  return m ? m[1]! : "";
}

export type PostcodeMatch = "same" | "area" | "none";

// Same full postcode, same outward code (NP20), or no match.
export function postcodeMatch(a: string, b: string): PostcodeMatch {
  const pa = ukPostcode(a);
  const pb = ukPostcode(b);
  if (pa && pb && pa === pb) return "same";
  const oa = outwardCode(a);
  const ob = outwardCode(b);
  return oa && ob && oa === ob ? "area" : "none";
}

// True for a UK Google address.
export function isUkAddress(address: string): boolean {
  const last = (address ?? "").split(",").pop()?.trim().toLowerCase() ?? "";
  return ["uk", "united kingdom", "gb"].includes(last) || (!last && !!ukPostcode(address));
}

const NAME_NOISE =
  /\b(the|ltd|limited|llp|plc|co|company|and|uk|services?|solutions?|group|of|trading|t\/a)\b/g;
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(NAME_NOISE, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

// The Google name and the registered name are the same business: one holds
// the other (sameBusiness), or most of the shorter name's words are shared.
export function similarName(google: string, registered: string): boolean {
  if (sameBusiness(registered, google)) return true;
  const a = new Set(words(google));
  const b = new Set(words(registered));
  if (!a.size || !b.size) return false;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const w of small) if (big.has(w)) shared++;
  return small.size >= 2 && shared / small.size >= 0.75;
}

// Exactly the same name once "Ltd", "The" and so on are taken away.
function exactName(google: string, registered: string): boolean {
  return words(google).join(" ") === words(registered).join(" ");
}

export interface ChSearchItem {
  title?: string;
  company_number?: string;
  company_status?: string;
  address?: { postal_code?: string };
  address_snippet?: string;
}

// Picks the company from a Companies House search: active, a similar name,
// and the registered office in the same postcode (or postcode area). With no
// postcode match, only an exact name counts, and is marked "name only".
export function pickCompany(
  items: ChSearchItem[],
  business: { name: string; address: string },
): { number: string; name: string; match: OwnerMatch } | null {
  const ranked = items
    .filter(
      (i) =>
        typeof i.company_number === "string" &&
        /^[A-Z0-9]{6,10}$/.test(i.company_number) &&
        (i.company_status ?? "").toLowerCase() === "active" &&
        i.title &&
        similarName(business.name, i.title),
    )
    .map((i) => {
      const pc = i.address?.postal_code || ukPostcode(i.address_snippet ?? "");
      const where = postcodeMatch(pc, business.address);
      const score =
        where === "same" ? 3 : where === "area" ? 2 : exactName(business.name, i.title!) ? 1 : 0;
      return { i, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return null;
  return {
    number: best.i.company_number!,
    name: String(best.i.title).slice(0, 200),
    match: best.score >= 2 ? "postcode match" : "name only",
  };
}

export interface ChOfficerItem {
  name?: string;
  officer_role?: string;
  appointed_on?: string;
  resigned_on?: string;
}

const OWNER_ROLES = ["director", "llp-member", "llp-designated-member"];

// Active directors (or LLP members), longest serving first.
export function activeOwners(items: ChOfficerItem[]): Officer[] {
  return items
    .filter(
      (o) =>
        typeof o.name === "string" &&
        o.name.trim() &&
        !o.resigned_on &&
        OWNER_ROLES.includes((o.officer_role ?? "").toLowerCase()),
    )
    .map((o) => ({
      name: o.name!.trim().slice(0, 160),
      role: (o.officer_role ?? "").toLowerCase(),
      appointed: /^\d{4}-\d{2}-\d{2}$/.test(o.appointed_on ?? "") ? o.appointed_on! : "",
    }))
    .sort((a, b) => (a.appointed || "9999").localeCompare(b.appointed || "9999"))
    .slice(0, 10);
}

export function roleLabel(role: string): string {
  return role === "director" ? "director" : role.startsWith("llp") ? "LLP member" : role;
}

export function companyUrl(number: string): string {
  return `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(number)}`;
}

// The first name to greet: the first Companies House director, else the
// name from the website.
export function ownerFirstName(owners: Officer[], websiteName: string | null | undefined): string {
  const ch = owners[0] ? splitOfficerName(owners[0].name).first : "";
  if (ch) return ch;
  return (websiteName ?? "").trim().split(/\s+/)[0] ?? "";
}

// ---------- a name on the business's own website ----------

// Capitalised words that are not names (title-case headings say "Run By Local
// People", "I'm Proud", "Owner Operated").
const NOT_NAME = new Set(
  (
    "a an the our we us you your my me i it this that here there and or of for to in on at by with from " +
    "about contact home team staff family local people owner owners founder founders director directors manager " +
    "managing operated owned run led based proud happy pleased delighted available qualified fully " +
    "insured experienced professional friendly reliable trusted independent small business company services service meet " +
    "cleaning cleaners cleaner plumbing plumber plumbers electrical electrician builders building construction " +
    "roofing roofer gardening garden landscaping removals carpets carpet windows window ltd limited group solutions " +
    "uk wales england scotland london cardiff newport swansea bristol welcome hello hi thanks thank call email today " +
    "now new more read view see get book quote free best top quality customer customers client clients clinic " +
    "salon studio shop restaurant cafe bar kitchen dental dentist practice surgery care health hair beauty " +
    "mr mrs ms miss dr sir lady lord monday tuesday wednesday thursday friday saturday sunday january february " +
    "march april may june july august september october november december just also always still not very so " +
    "going looking passionate dedicated committed certified registered accredited approved one two three"
  ).split(" "),
);

const NAME_WORD = "[A-Z][a-z]{1,14}(?:[-'’][A-Z]?[a-z]{1,14})?";
const NAME = `(${NAME_WORD}(?:\\s${NAME_WORD})?)`;

// "Meet Dave" -> "Dave", "Dave Cleaning" -> "Dave", "Local People" -> "".
function goodName(raw: string): string {
  const parts = raw.trim().split(/\s+/);
  while (parts.length && NOT_NAME.has(parts[0]!.toLowerCase())) parts.shift();
  const kept: string[] = [];
  for (const p of parts.slice(0, 2)) {
    if (NOT_NAME.has(p.toLowerCase())) break;
    kept.push(p);
  }
  return kept.join(" ");
}

function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&#x27;|&rsquo;|&apos;/gi, "'")
    .replace(/’/g, "'")
    .replace(/\s+/g, " ");
}

// founder / Person with an owner-like job title in JSON-LD.
function fromJsonLd(html: string): string {
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const personName = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return personName(v[0]);
    if (v && typeof v === "object" && typeof (v as { name?: unknown }).name === "string")
      return (v as { name: string }).name;
    return "";
  };
  const walk = (node: unknown, depth: number): string => {
    if (!node || typeof node !== "object" || depth > 5) return "";
    if (Array.isArray(node)) {
      for (const n of node) {
        const r = walk(n, depth + 1);
        if (r) return r;
      }
      return "";
    }
    const o = node as Record<string, unknown>;
    for (const k of ["founder", "founders"]) {
      const n = personName(o[k]);
      if (n) return n;
    }
    const type = String(o["@type"] ?? "");
    if (
      /^Person$/i.test(type) &&
      typeof o["jobTitle"] === "string" &&
      /owner|founder|director|proprietor/i.test(o["jobTitle"]) &&
      typeof o["name"] === "string"
    )
      return o["name"];
    // Never "author": review authors are customers.
    for (const k of ["@graph", "employee", "member"]) {
      const r = walk(o[k], depth + 1);
      if (r) return r;
    }
    return "";
  };
  while ((m = re.exec(html))) {
    try {
      const n = walk(JSON.parse(m[1]!), 0);
      const clean = n.replace(/\s+/g, " ").trim();
      if (new RegExp(`^${NAME_WORD}(\\s${NAME_WORD})?$`).test(clean)) {
        const g = goodName(clean);
        if (g) return g;
      }
    } catch {
      // not valid JSON
    }
  }
  return "";
}

// Phrases that introduce the owner, most trusted first. The name itself must
// be one or two capitalised words.
const TEXT_PATTERNS: RegExp[] = [
  new RegExp(`\\b[Mm]y name is ${NAME}`),
  new RegExp(`\\b(?:[Oo]wner|[Ff]ounder|[Dd]irector|[Pp]roprietor)\\s?[:\\-]\\s?${NAME}`),
  new RegExp(`\\b${NAME},? (?:the |our )?(?:[Oo]wner|[Ff]ounder|[Pp]roprietor)\\b`),
  new RegExp(`\\b${NAME} \\((?:[Oo]wner|[Ff]ounder|[Dd]irector|[Pp]roprietor)\\)`),
  new RegExp(`\\b(?:[Ff]ounded|[Ss]tarted|[Oo]wned) by ${NAME}`),
  new RegExp(`\\b(?:[Oo]wner|[Ff]ounder),? ${NAME}`),
  new RegExp(`\\b[Rr]un by ${NAME}`),
  new RegExp(`\\bI(?:'m| am) ${NAME}[,.! ]`),
];

// A likely owner name on one web page, or "". Conservative: one or two
// capitalised words that are not common or business words.
export function extractOwnerName(html: string): string {
  if (!html) return "";
  const ld = fromJsonLd(html);
  if (ld) return ld;
  const text = textOf(html).slice(0, 300_000);
  for (const re of TEXT_PATTERNS) {
    const g = new RegExp(re.source, "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      const name = goodName(m[1]!);
      if (name) return name.slice(0, 60);
    }
  }
  return "";
}

// The line shown on a prospect card.
export function ownerLine(p: {
  owners: Officer[];
  ownerSource: string | null;
  companyNumber: string | null;
  ownerMatch: string | null;
  websiteOwnerName: string;
}): { label: string; source: string; href: string | null; sure: boolean } | null {
  const first = p.owners[0];
  if (p.ownerSource === "companies_house" && first && p.companyNumber)
    return {
      label: `Owner: ${officerDisplayName(first.name)}`,
      source: `Companies House, ${roleLabel(first.role)}${p.ownerMatch === "name only" ? ", name match only" : ""}`,
      href: companyUrl(p.companyNumber),
      sure: p.ownerMatch !== "name only",
    };
  if (p.websiteOwnerName)
    return {
      label: `Possible owner: ${p.websiteOwnerName}`,
      source: "from their website",
      href: null,
      sure: false,
    };
  return null;
}
