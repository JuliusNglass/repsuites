// Static homepage observations. Absence in HTML is not proof about rendered JS.
export interface WebsiteFinding {
  id: string;
  status: "pass" | "review";
  label: string;
  evidence: string;
  recommendation: string;
}
export interface WebsiteAudit {
  version: 1;
  checkedAt: string;
  url: string;
  status: "checked" | "unavailable" | "no_website";
  findings: WebsiteFinding[];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, decimal: string) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (entity) => {
      const decoded: Record<string, string> = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
        "&nbsp;": " ",
      };
      return decoded[entity.toLowerCase()] ?? entity;
    });
}

const text = (s: string) =>
  decodeHtml(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
function attribute(tag: string, name: string): string {
  return (
    tag
      .match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
      ?.slice(1)
      .find((v) => v !== undefined) ?? ""
  );
}

// What Google shows for the business, so the site can be compared with it.
export interface GoogleDetails {
  phone?: string;
  address?: string;
  service?: string;
  town?: string;
}

// Compare phone numbers by their last 9 digits, so "+44 7700 900123" and
// "07700 900123" count as the same number.
export function phoneKey(p: string | null | undefined): string | null {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}

// Phone-like text on the page (10 to 14 digits once spaces are removed).
export function phonesIn(textValue: string): string[] {
  const out = new Set<string>();
  for (const m of textValue.match(/(?:\+|00)?\d[\d\s().-]{8,16}\d/g) ?? []) {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 14) out.add(m.trim());
  }
  return [...out].slice(0, 10);
}

// UK postcode, e.g. "NP20 1AB" from "12 High St, Newport NP20 1AB, UK".
export function postcodeOf(address: string | null | undefined): string | null {
  const m = String(address ?? "")
    .toUpperCase()
    .match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// True when every word of the service (or town) appears, ignoring a final "s".
function mentions(hay: string, needle: string | undefined): boolean {
  const words = plain(needle ?? "")
    .replace(/\b(near me|in|best|top|local|the)\b/g, " ")
    .split(" ")
    .filter((w) => w.length > 2);
  if (!words.length) return false;
  const h = plain(hay);
  return words.every((w) => h.includes(w.replace(/s$/, "")));
}

// Share of checks passed, out of 100. Worked example: 4 of 10 checks passed
// gives 4 / 10 = 0.4, so 40/100. Null when nothing could be checked.
export function websiteScore(audit: WebsiteAudit | undefined | null): number | null {
  if (!audit || audit.status !== "checked" || !audit.findings.length) return null;
  const passed = audit.findings.filter((f) => f.status === "pass").length;
  return Math.round((passed / audit.findings.length) * 100);
}

export function auditHomepage(
  html: string,
  url: string,
  checkedAt: string,
  google: GoogleDetails = {},
): WebsiteAudit {
  // Remove comments and executable/style text before looking for visible tags.
  const markup = html.replace(/<!--[\s\S]*?-->/g, "");
  const visible = markup.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const title = text(visible.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "");
  const headings = [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)]
    .map((m) => text(m[1]!))
    .filter(Boolean);
  const metas = [...visible.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (name: string) =>
    decodeHtml(
      attribute(metas.find((t) => attribute(t, "name").toLowerCase() === name) ?? "", "content"),
    ).trim();
  const telLinks = [...visible.matchAll(/<a\b[^>]*>/gi)]
    .map((m) => attribute(m[0], "href"))
    .filter((href) => /^tel:\+?[\d ()-]+$/i.test(href))
    .map((href) => href.slice(4));
  const phone = telLinks.length > 0;
  const pageText = decodeHtml(visible.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
  const sitePhones = [...new Set([...telLinks, ...phonesIn(pageText)])];
  const mapEmbed =
    /google\.[a-z.]+\/maps\/embed|maps\.google\.[a-z.]+\/maps\?[^"']*output=embed|google\.com\/maps\?[^"']*output=embed|maps\.googleapis\.com\/maps\/api\/js/i.test(
      markup,
    );
  let schema = false;
  for (const m of markup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attribute(m[1]!, "type").toLowerCase() !== "application/ld+json") continue;
    try {
      const parsed: unknown = JSON.parse(m[2]!);
      schema ||= !!parsed && typeof parsed === "object";
    } catch {
      /* invalid JSON is not evidence */
    }
  }
  const check = (
    id: string,
    pass: boolean,
    label: string,
    evidence: string,
    recommendation: string,
  ): WebsiteFinding => ({ id, status: pass ? "pass" : "review", label, evidence, recommendation });
  return {
    version: 1,
    checkedAt,
    url,
    status: "checked",
    findings: [
      check(
        "title",
        !!title,
        "Page title",
        title || "No non-empty title found in the returned HTML.",
        "Use a clear page title describing the service and location where relevant.",
      ),
      check(
        "h1",
        headings.length === 1,
        "Main heading",
        headings.length
          ? `${headings.length} main heading(s): ${headings.join("; ")}`
          : "No non-empty H1 found in the returned HTML.",
        "Check the rendered page has a clear main heading that describes the business.",
      ),
      check(
        "description",
        !!meta("description"),
        "Search description",
        meta("description") || "No meta description found in the returned HTML.",
        "Write an accurate summary of this page for search visitors.",
      ),
      check(
        "viewport",
        !!meta("viewport"),
        "Mobile viewport",
        meta("viewport") || "No viewport declaration found in the returned HTML.",
        "Check the page on a phone and add an appropriate viewport declaration.",
      ),
      check(
        "phone",
        phone,
        "Tap to call",
        phone ? "A telephone link was found." : "No telephone link found in the returned HTML.",
        "Where telephone enquiries matter, add an accessible tap-to-call link and verify the number.",
      ),
      check(
        "schema",
        schema,
        "Structured data",
        schema
          ? "Parseable JSON-LD found. Business identity and schema validity need manual review."
          : "No parseable JSON-LD found in the returned HTML.",
        "Review appropriate structured data against the actual business details and validate it.",
      ),
      ...extraChecks(),
    ],
  };

  // Checks that need what Google shows. Each is left out when Google gave us
  // nothing to compare with, so a business is never marked down for missing data.
  function extraChecks(): WebsiteFinding[] {
    const out: WebsiteFinding[] = [];
    if (google.service && google.town) {
      const words = `${title} ${headings.join(" ")}`;
      const ok = mentions(words, google.service) && mentions(words, google.town);
      out.push(
        check(
          "local_wording",
          ok,
          "Service and town in the title or heading",
          ok
            ? `The title or main heading mentions ${google.service} and ${google.town}.`
            : `Neither the title nor the main heading says ${google.service} and ${google.town} together.`,
          `Say what you do and where, for example "${google.service} in ${google.town}".`,
        ),
      );
    }
    const gKey = phoneKey(google.phone);
    if (gKey) {
      const match = sitePhones.some((p) => phoneKey(p) === gKey);
      out.push(
        check(
          "phone_match",
          match,
          "Phone number matches Google",
          match
            ? `The site shows ${google.phone}, the same number as Google.`
            : sitePhones.length
              ? `Google shows ${google.phone}. The site shows ${sitePhones[0]}.`
              : "No phone number was found on the homepage.",
          "Use exactly the same phone number on the website and the Google Business Profile.",
        ),
      );
    }
    const pc = postcodeOf(google.address);
    if (pc) {
      const match = pageText.toUpperCase().replace(/\s+/g, "").includes(pc);
      out.push(
        check(
          "address_match",
          match,
          "Address matches Google",
          match
            ? "The postcode on Google also appears on the homepage."
            : `The postcode Google shows (${google.address}) was not found on the homepage.`,
          "Show the same name, address and phone number as the Google Business Profile, ideally in the footer.",
        ),
      );
    }
    // The map check only runs in a full report (with Google details), so the
    // basic homepage check stays the same as before.
    if (google.phone || google.address || google.town)
      out.push(
        check(
          "map",
          mapEmbed,
          "Google map on the site",
          mapEmbed ? "A Google map was found." : "No Google map was found on the homepage.",
          "Put a Google map on the contact page so customers and Google can see where you are.",
        ),
      );
    return out;
  }
}
