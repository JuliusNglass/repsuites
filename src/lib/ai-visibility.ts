// AI search visibility: pure helpers. Client-safe. No em dashes in copy.

export interface AiAnswer {
  question: string;
  named: boolean;
  position: number | null; // 1 = first business the assistant named
  businesses: string[]; // the businesses it named, in order
  sources?: string[]; // websites the assistant read (domains)
}

// "best burger", "top cleaners near me" -> "burger", "cleaners".
export function cleanService(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(the|best|top|good|great|cheap|cheapest|recommended)\b/g, " ")
    .replace(/\bnear me\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// Across all answers: who the assistant recommends most, and which websites
// it read most. These two lists are what an owner can act on.
export function aiSummary(results: AiAnswer[], business: string) {
  const names = new Map<string, number>();
  const sites = new Map<string, number>();
  for (const r of results) {
    for (const b of r.businesses) {
      if (sameBusiness(b, business)) continue;
      names.set(b, (names.get(b) ?? 0) + 1);
    }
    for (const d of new Set(r.sources ?? [])) sites.set(d, (sites.get(d) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => ({ name: k, count: v }));
  return { rivals: top(names, 5), sites: top(sites, 6) };
}

// The questions a customer would ask an assistant.
export function aiQuestions(service: string, town: string): string[] {
  const s = cleanService(service) || service.trim().toLowerCase();
  const t = town.trim();
  return [
    `What is the best ${s} in ${t}?`,
    `Can you recommend a good ${s} near ${t}?`,
    `Which ${s} in ${t} has the best reviews?`,
  ];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|ltd|limited|llc|inc|plc|co)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// True when a listed name is the business: exact after tidying, or one
// contains the other ("The Italian Job" vs "Italian Job Newport").
export function sameBusiness(listed: string, business: string): boolean {
  const a = norm(listed);
  const b = norm(business);
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  return short.length >= 5 && long.includes(short);
}

// Reads the assistant's list (JSON {"businesses": [...]}) and finds the business.
// True when the text holds a readable list (even an empty one).
export function hasList(text: string): boolean {
  const m = text.match(/\{[^{}]*"businesses"[\s\S]*?\}/);
  if (!m) return false;
  try {
    return Array.isArray((JSON.parse(m[0]) as { businesses?: unknown }).businesses);
  } catch {
    return false;
  }
}

export function readAnswer(
  question: string,
  text: string,
  business: string,
  sources: string[] = [],
): AiAnswer {
  let list: string[] = [];
  const m = text.match(/\{[^{}]*"businesses"[\s\S]*?\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]) as { businesses?: unknown };
      if (Array.isArray(o.businesses))
        list = o.businesses
          .map((b) => (typeof b === "string" ? b : String((b as { name?: unknown })?.name ?? "")))
          .map((b) => b.trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, 10);
    } catch {
      list = [];
    }
  }
  const idx = list.findIndex((b) => sameBusiness(b, business));
  return {
    question,
    named: idx >= 0,
    position: idx >= 0 ? idx + 1 : null,
    businesses: list,
    sources: [...new Set(sources)].slice(0, 12),
  };
}
