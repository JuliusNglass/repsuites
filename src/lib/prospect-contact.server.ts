// Server-only: the email finder for the lead generator. For each business
// with a website, read the home page and, if no email is there, one likely
// contact page. Keeps emails and Facebook/Instagram links in
// prospect_contacts (by Google place id) so repeat searches are instant, and
// re-checks after 30 days.
//
// The Workers free plan allows 50 outside calls per request. One call here
// handles up to 8 businesses with at most 24 page fetches (redirects count),
// one cache read, one cache write and up to 8 updates to saved prospects.
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { contactsFresh, extractContacts, rankEmails, siteDomain } from "./prospect-contact";

export const FINDER_BATCH = 8;
const PAGE_BUDGET = 24;
const TIMEOUT_MS = 4000;
const MAX_BYTES = 600_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export interface FoundContacts {
  placeId: string;
  email: string;
  emails: string[];
  facebook: string;
  instagram: string;
  foundAt: string;
}

export interface CacheRow {
  place_id: string;
  email: string | null;
  emails: string[] | null;
  facebook_url: string | null;
  instagram_url: string | null;
  found_at: string;
}

export function fromRow(r: CacheRow): FoundContacts {
  return {
    placeId: r.place_id,
    email: r.email ?? "",
    emails: r.emails ?? [],
    facebook: r.facebook_url ?? "",
    instagram: r.instagram_url ?? "",
    foundAt: r.found_at,
  };
}

// Cached results for these places (fresh or not; the caller decides).
export async function cachedContacts(placeIds: string[]): Promise<Map<string, FoundContacts>> {
  const out = new Map<string, FoundContacts>();
  if (!placeIds.length) return out;
  const r = await serviceRead<CacheRow[]>(
    `prospect_contacts?select=place_id,email,emails,facebook_url,instagram_url,found_at&place_id=in.(${placeIds
      .map((p) => `"${p}"`)
      .join(",")})`,
    "",
  );
  for (const row of r.data ?? []) out.set(row.place_id, fromRow(row));
  return out;
}

// Only public web addresses: no localhost, raw IPs or odd ports.
export function safeSiteUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "";
  if (u.port && u.port !== "80" && u.port !== "443") return "";
  const h = u.hostname.toLowerCase();
  if (
    !h.includes(".") ||
    /^[\d.]+$/.test(h) ||
    h.includes(":") ||
    h.endsWith(".local") ||
    h === "localhost"
  )
    return "";
  return u.toString();
}

// Fetches one page as text, following up to 3 redirects by hand so each hop
// is counted against the budget.
async function getPage(
  url: string,
  budget: { left: number },
): Promise<{ html: string; url: string } | null> {
  let at = url;
  for (let hop = 0; hop < 4; hop++) {
    if (budget.left <= 0) return null;
    budget.left--;
    const safe = safeSiteUrl(at);
    if (!safe) return null;
    let r: Response;
    try {
      r = await fetch(safe, {
        redirect: "manual",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "en-GB,en;q=0.9",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return null;
    }
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      try {
        await r.body?.cancel();
      } catch {
        // ignore
      }
      if (!loc) return null;
      try {
        at = new URL(loc, safe).toString();
      } catch {
        return null;
      }
      continue;
    }
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "";
    if (type && !/html|text\/plain/i.test(type)) return null;
    try {
      const text = await r.text();
      return { html: text.slice(0, MAX_BYTES), url: safe };
    } catch {
      return null;
    }
  }
  return null;
}

// Looks at one website: the home page, then one contact page if needed.
export async function scanSite(
  website: string,
  budget: { left: number },
): Promise<Omit<FoundContacts, "placeId" | "foundAt">> {
  const empty = { email: "", emails: [], facebook: "", instagram: "" };
  const start = safeSiteUrl(website);
  if (!start) return empty;
  const home = await getPage(start, budget);
  if (!home) return empty;
  const a = extractContacts(home.html, home.url);
  let emails = a.emails;
  let facebook = a.facebook;
  let instagram = a.instagram;
  if (!emails.length) {
    const origin = new URL(home.url).origin;
    const next = a.contactUrl || `${origin}/contact`;
    if (next.replace(/\/$/, "") !== home.url.replace(/\/$/, "")) {
      const page = await getPage(next, budget);
      if (page) {
        const b = extractContacts(page.html, page.url);
        emails = b.emails;
        facebook ||= b.facebook;
        instagram ||= b.instagram;
      }
    }
  }
  const ranked = rankEmails(emails, website).slice(0, 5);
  return { email: ranked[0] ?? "", emails: ranked, facebook, instagram };
}

// Finds contacts for up to 8 businesses. Uses the cache where it is fresh.
export async function findContacts(
  items: {
    placeId: string;
    website: string;
    saved?: boolean | undefined;
    hasEmail?: boolean | undefined;
  }[],
  force = false,
): Promise<FoundContacts[]> {
  const list = items.slice(0, FINDER_BATCH);
  const cache = await cachedContacts(list.map((i) => i.placeId));
  const out: FoundContacts[] = [];
  const todo: typeof list = [];
  for (const i of list) {
    const c = cache.get(i.placeId);
    if (c && !force && contactsFresh(c.foundAt)) out.push(c);
    else todo.push(i);
  }
  if (!todo.length) return out;
  const budget = { left: PAGE_BUDGET };
  const now = new Date().toISOString();
  const fresh = await Promise.all(
    todo.map(async (i) => ({
      placeId: i.placeId,
      foundAt: now,
      ...(await scanSite(i.website, budget)),
    })),
  );
  out.push(...fresh);
  await serviceWrite<unknown>("prospect_contacts?on_conflict=place_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: fresh.map((f) => ({
      place_id: f.placeId,
      website: siteDomain(todo.find((t) => t.placeId === f.placeId)?.website ?? "") || null,
      email: f.email || null,
      emails: f.emails,
      facebook_url: f.facebook || null,
      instagram_url: f.instagram || null,
      found_at: now,
    })),
  });
  // Saved prospects get the links, and the email if they have none yet.
  // Never overwrites an email typed in by hand.
  await Promise.all(
    fresh.map((f) => {
      const item = todo.find((t) => t.placeId === f.placeId);
      if (!item?.saved || !(f.email || f.facebook || f.instagram)) return null;
      const withEmail = !!f.email && !item.hasEmail;
      return serviceWrite<unknown>(
        `prospects?place_id=eq.${encodeURIComponent(f.placeId)}${withEmail ? "&email=is.null" : ""}`,
        "",
        {
          method: "PATCH",
          body: {
            ...(withEmail ? { email: f.email } : {}),
            ...(f.facebook ? { facebook_url: f.facebook } : {}),
            ...(f.instagram ? { instagram_url: f.instagram } : {}),
          },
        },
      );
    }),
  );
  return out;
}
