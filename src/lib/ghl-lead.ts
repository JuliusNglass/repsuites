// Builds the GoHighLevel contact sent when someone runs the free Google Check
// on /check. Pure, so it can be tested. Tags drive the GHL follow-up
// workflows (free check -> Fix-It Pack -> RepSuites -> SparkOps call).

export const HEADACHES = ["clients", "admin", "hiring", "checking", "other"] as const;
export type Headache = (typeof HEADACHES)[number];

export const SIZES = ["solo", "2-5", "6-15", "16-25", "25+"] as const;
export type Size = (typeof SIZES)[number];

// Accelur8 Ltd sub-account.
export const GHL_LOCATION_ID = "HzEU9UBWZEzxuB5SSDYE";

export type GhlLeadInput = {
  name: string;
  email: string;
  phone: string;
  business: string;
  town: string;
  niche: string;
  size: Size | null;
  headache: Headache | null;
  consentEmail: boolean;
  consentWhatsapp: boolean;
  reportUrl: string | null;
  source: string;
};

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

// Tag-safe: lower case, letters, digits and hyphens only.
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function ghlLeadTags(p: GhlLeadInput): string[] {
  const t = ["free-check", `niche-${slug(p.niche) || "general"}`, `src-${slug(p.source) || "direct"}`];
  if (p.size) t.push(`size-${slug(p.size)}`);
  if (p.headache) t.push(`headache-${p.headache}`);
  if (p.consentEmail) t.push("consent-email");
  if (p.consentWhatsapp) t.push("consent-whatsapp");
  // Owners with 3+ cleaners and a SparkOps-shaped headache go to the call path.
  const bigEnough = p.size !== null && p.size !== "solo";
  if (bigEnough && p.headache && p.headache !== "clients" && p.headache !== "other")
    t.push("route-sparkops-call");
  else t.push("route-fixit-pack");
  return t;
}

export function ghlLeadBody(p: GhlLeadInput) {
  const { first, last } = splitName(p.name);
  return {
    locationId: GHL_LOCATION_ID,
    firstName: first,
    lastName: last,
    email: p.email,
    phone: p.phone || undefined,
    companyName: p.business,
    city: p.town || undefined,
    source: `RepSuites free check (${p.source || "direct"})`,
    tags: ghlLeadTags(p),
    // Saved as a note-friendly website field so the report link shows on the contact.
    website: p.reportUrl ?? undefined,
  };
}
