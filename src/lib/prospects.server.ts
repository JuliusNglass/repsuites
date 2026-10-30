/* eslint-disable @typescript-eslint/no-explicit-any -- Google and PostgREST JSON is checked field by field. */
// Server-only: the lead generator (Accelur8 team only).
//
// Search Google for a business, or a niche in a town, then build an insight
// report from Google's own data: rating and reviews against the nearest
// rivals, where the business shows on Google Maps for its main search (one
// DataForSEO check), profile gaps and how fresh its reviews are. Every number
// comes from Google or the Maps check; nothing is estimated or invented.
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";

const PLACE_RE = /^[A-Za-z0-9_-]{10,300}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const STAGES = ["new", "sent", "opened", "replied", "booked", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];

function mapsKey(): string {
  return (process.env["REPSUITES_GOOGLE_MAPS_KEY"] ?? "").trim();
}

export async function agencyGuard(write: boolean) {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: false });
  if (!g.ok) return { ok: false as const, error: g.error || "Sign in again." };
  const a = await serviceRead<{ user_id: string }[]>(
    `agency_users?select=user_id&user_id=eq.${g.session.user_id}`,
    "",
  );
  if (!a.data?.length) return { ok: false as const, error: "For the Accelur8 team only." };
  if (write && !(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Invalid request origin" };
  return { ok: true as const, userId: g.session.user_id };
}

async function places(path: string, mask: string, body?: unknown): Promise<any | null> {
  const key = mapsKey();
  if (!key) return null;
  try {
    const r = await fetch(`https://places.googleapis.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": mask,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export interface SearchHit {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviews: number;
  category: string;
}

export async function searchBusinesses(query: string): Promise<SearchHit[] | null> {
  const j = await places(
    "places:searchText",
    "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.primaryTypeDisplayName",
    { textQuery: query, pageSize: 20, languageCode: "en" },
  );
  if (!j) return null;
  return (j.places ?? [])
    .filter((p: any) => typeof p.id === "string" && PLACE_RE.test(p.id))
    .map((p: any) => ({
      placeId: p.id,
      name: String(p.displayName?.text ?? "").slice(0, 200),
      address: String(p.formattedAddress ?? "").slice(0, 300),
      rating: typeof p.rating === "number" ? p.rating : null,
      reviews: Number(p.userRatingCount ?? 0),
      category: String(p.primaryTypeDisplayName?.text ?? ""),
    }));
}

// ---------- the report ----------

export interface Report {
  createdAt: string;
  business: {
    name: string;
    address: string;
    town: string;
    category: string;
    rating: number | null;
    reviews: number;
    phone: string;
    website: string;
    hasHours: boolean;
    hasDescription: boolean;
    photos: number;
    mapsUrl: string;
    newestReviewDays: number | null;
  };
  rivals: { name: string; rating: number | null; reviews: number }[];
  maps: { keyword: string; position: number | null; checked: boolean };
  score: number;
  parts: { label: string; got: number; max: number }[];
  fixes: { title: string; why: string; priority: "high" | "medium" }[];
  reviewGap: { leader: string; leaderReviews: number; need: number; weeksAt5: number } | null;
}

const DETAIL_MASK =
  "id,displayName,formattedAddress,addressComponents,location,rating,userRatingCount,nationalPhoneNumber,internationalPhoneNumber,websiteUri,regularOpeningHours,editorialSummary,photos,primaryTypeDisplayName,googleMapsUri,reviews";

function ratingPoints(r: number | null): number {
  if (r === null) return 0;
  if (r >= 4.7) return 25;
  if (r >= 4.5) return 20;
  if (r >= 4.2) return 15;
  if (r >= 4.0) return 10;
  return 5;
}

function mapsPoints(pos: number | null): number {
  if (pos === null) return 0;
  if (pos <= 3) return 25;
  if (pos <= 7) return 15;
  return 8;
}

export async function buildReport(
  placeId: string,
  keywordOverride?: string,
): Promise<{
  report: Report;
  meta: {
    name: string;
    address: string;
    town: string;
    phone: string;
    website: string;
    category: string;
    lat: number | null;
    lng: number | null;
  };
} | null> {
  if (!PLACE_RE.test(placeId)) return null;
  const p = await places(`places/${encodeURIComponent(placeId)}`, DETAIL_MASK);
  if (!p?.id) return null;
  const name = String(p.displayName?.text ?? "").slice(0, 200);
  const category = String(p.primaryTypeDisplayName?.text ?? "").slice(0, 120);
  const comp = (t: string) =>
    p.addressComponents?.find((c: any) => c.types?.includes(t))?.longText ?? "";
  const town = String(
    comp("postal_town") || comp("locality") || comp("administrative_area_level_2") || "",
  ).slice(0, 120);
  const lat = typeof p.location?.latitude === "number" ? p.location.latitude : null;
  const lng = typeof p.location?.longitude === "number" ? p.location.longitude : null;
  const rating = typeof p.rating === "number" ? p.rating : null;
  const reviews = Number(p.userRatingCount ?? 0);
  const newest = (p.reviews ?? [])
    .map((r: any) => Date.parse(r.publishTime ?? ""))
    .filter((t: number) => Number.isFinite(t))
    .sort((a: number, b: number) => b - a)[0];
  const newestReviewDays = newest ? Math.floor((Date.now() - newest) / 86400000) : null;

  // Nearest rivals: same kind of business within about 3 km, busiest first.
  let rivals: Report["rivals"] = [];
  if (category && lat !== null && lng !== null) {
    const j = await places(
      "places:searchText",
      "places.id,places.displayName,places.rating,places.userRatingCount",
      {
        textQuery: category,
        pageSize: 15,
        languageCode: "en",
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 3000 } },
      },
    );
    rivals = (j?.places ?? [])
      .filter((x: any) => x.id !== p.id)
      .map((x: any) => ({
        name: String(x.displayName?.text ?? "").slice(0, 200),
        rating: typeof x.rating === "number" ? x.rating : null,
        reviews: Number(x.userRatingCount ?? 0),
      }))
      .sort((a: any, b: any) => b.reviews - a.reviews)
      .slice(0, 3);
  }

  // Where it shows on Google Maps for its main search, from its own street.
  const keyword = (keywordOverride || category || "").toLowerCase().slice(0, 80);
  let position: number | null = null;
  let checked = false;
  if (keyword && lat !== null && lng !== null) {
    const { creds, mapsResults } = await import("./rank-tracking.server");
    const { rankIn } = await import("./rank-grid");
    const auth = creds();
    if (auth) {
      const r = await mapsResults(auth, keyword, lat, lng);
      if (r.ok) {
        checked = true;
        position = rankIn(r.items, p.id, name);
      }
    }
  }

  const hasHours = !!p.regularOpeningHours;
  const hasDescription = !!p.editorialSummary?.text;
  const photos = Array.isArray(p.photos) ? p.photos.length : 0;
  const website = String(p.websiteUri ?? "").slice(0, 300);
  // International format, so WhatsApp and text links work from anywhere.
  const phone = String(p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? "").slice(0, 40);

  const leader = rivals[0];
  const reviewPoints = leader
    ? Math.round(Math.min(1, reviews / Math.max(1, leader.reviews)) * 25)
    : reviews >= 100
      ? 25
      : Math.round((reviews / 100) * 25);
  const profilePoints =
    (website ? 5 : 0) +
    (phone ? 5 : 0) +
    (hasHours ? 5 : 0) +
    (hasDescription ? 5 : 0) +
    (photos >= 10 ? 5 : Math.round(photos / 2));
  const parts: Report["parts"] = [
    { label: "Star rating", got: ratingPoints(rating), max: 25 },
    { label: "Number of reviews against your busiest rival", got: reviewPoints, max: 25 },
    { label: "Google profile complete", got: profilePoints, max: 25 },
  ];
  if (checked) parts.push({ label: "Position on Google Maps", got: mapsPoints(position), max: 25 });
  const got = parts.reduce((t, x) => t + x.got, 0);
  const max = parts.reduce((t, x) => t + x.max, 0);
  const score = Math.round((got / max) * 100);

  const fixes: Report["fixes"] = [];
  if (checked && (position === null || position > 3))
    fixes.push({
      title:
        position === null
          ? `You do not show in the first 20 Google Maps results for "${keyword}" from your own street`
          : `You are number ${position} on Google Maps for "${keyword}" from your own street`,
      why: "People nearby tap one of the first 3 businesses on the map. Getting into those 3 is the fastest way to more calls.",
      priority: "high",
    });
  if (leader && reviews < leader.reviews)
    fixes.push({
      title: `${leader.name} has ${leader.reviews} Google reviews. You have ${reviews}.`,
      why: "Google and customers both favour businesses with more, and more recent, reviews.",
      priority: "high",
    });
  if (newestReviewDays !== null && newestReviewDays > 30)
    fixes.push({
      title: `Your newest review shown on Google is ${Math.round(newestReviewDays / 7)} weeks old`,
      why: "A steady flow of new reviews tells Google and customers you are busy and trusted.",
      priority: "medium",
    });
  if (rating !== null && rivals.length) {
    const rated = rivals.filter((r) => r.rating !== null);
    const avg = rated.length ? rated.reduce((t, r) => t + (r.rating ?? 0), 0) / rated.length : null;
    if (avg !== null && rating < avg - 0.05)
      fixes.push({
        title: `Your rating is ${rating.toFixed(1)}. Your nearest rivals average ${avg.toFixed(1)}.`,
        why: "Replying to every review, good and bad, and asking every customer (not just the happy ones) lifts the average over time.",
        priority: "medium",
      });
  }
  if (!website)
    fixes.push({
      title: "No website on your Google profile",
      why: "Customers and Google use it to check you are real and what you offer.",
      priority: "medium",
    });
  if (!hasHours)
    fixes.push({
      title: "No opening hours on your Google profile",
      why: "Without hours, Google shows you less often to people searching right now.",
      priority: "medium",
    });
  if (!hasDescription)
    fixes.push({
      title: "No business description on your Google profile",
      why: "A clear description with what you do and where helps you show for the right searches.",
      priority: "medium",
    });
  if (photos < 10)
    fixes.push({
      title: `Only ${photos} photo${photos === 1 ? "" : "s"} on your Google profile`,
      why: "Profiles with plenty of recent photos get more views and clicks.",
      priority: "medium",
    });
  if (!phone)
    fixes.push({
      title: "No phone number on your Google profile",
      why: "People searching on a phone often just want to call.",
      priority: "high",
    });

  const reviewGap =
    leader && leader.reviews > reviews
      ? {
          leader: leader.name,
          leaderReviews: leader.reviews,
          need: leader.reviews - reviews,
          weeksAt5: Math.ceil((leader.reviews - reviews) / 5),
        }
      : null;

  return {
    report: {
      createdAt: new Date().toISOString(),
      business: {
        name,
        address: String(p.formattedAddress ?? "").slice(0, 300),
        town,
        category,
        rating,
        reviews,
        phone,
        website,
        hasHours,
        hasDescription,
        photos,
        mapsUrl: String(p.googleMapsUri ?? "").slice(0, 500),
        newestReviewDays,
      },
      rivals,
      maps: { keyword, position, checked },
      score,
      parts,
      fixes: fixes
        .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1))
        .slice(0, 6),
      reviewGap,
    },
    meta: {
      name,
      address: String(p.formattedAddress ?? "").slice(0, 300),
      town,
      phone,
      website,
      category,
      lat,
      lng,
    },
  };
}

function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Build (or rebuild) the report for a place and save it as a prospect.
export async function saveProspectReport(
  placeId: string,
  source: "search" | "niche" | "inbound",
  extra: {
    email?: string | null;
    contactName?: string | null;
    createdBy?: string | null;
    keyword?: string;
  } = {},
) {
  const built = await buildReport(placeId, extra.keyword);
  if (!built)
    return { ok: false as const, error: "Google could not find that business. Try again." };
  const existing = await serviceRead<{ id: string; report_token: string | null }[]>(
    `prospects?select=id,report_token&place_id=eq.${encodeURIComponent(placeId)}`,
    "",
  );
  const row = existing.data?.[0];
  const token = row?.report_token ?? newToken();
  const body = {
    place_id: placeId,
    name: built.meta.name || "Business",
    address: built.meta.address || null,
    town: built.meta.town || null,
    phone: built.meta.phone || null,
    website: built.meta.website || null,
    category: built.meta.category || null,
    lat: built.meta.lat,
    lng: built.meta.lng,
    report: built.report,
    report_at: new Date().toISOString(),
    report_token: token,
    updated_at: new Date().toISOString(),
    ...(extra.email ? { email: extra.email } : {}),
    ...(extra.contactName ? { contact_name: extra.contactName } : {}),
  };
  const w = row
    ? await serviceWrite<unknown>(`prospects?id=eq.${row.id}`, "", { method: "PATCH", body })
    : await serviceWrite<unknown>("prospects", "", {
        method: "POST",
        body: { ...body, source, created_by: extra.createdBy ?? null },
      });
  if (w.error) return { ok: false as const, error: "Could not save the report." };
  return { ok: true as const, token, score: built.report.score, name: built.meta.name };
}

export function validStage(s: string): s is Stage {
  return (STAGES as readonly string[]).includes(s);
}

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
