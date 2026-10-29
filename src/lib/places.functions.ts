// Business lookup for the public free-check form: as someone types their
// business name we suggest matching Google listings, then fetch the chosen
// one so they can confirm it. Uses Google Places API (New).
//
// The key (REPSUITES_GOOGLE_MAPS_KEY) is read on the server only. Without it
// both functions return nothing and the form works as plain text fields.
// Requests must come from our own site (origin check) so the endpoint cannot
// be used by other sites to spend our quota.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { verifyRequestOriginAsync } from "./auth.server";

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;

function mapsKey(): string {
  return (process.env["REPSUITES_GOOGLE_MAPS_KEY"] ?? "").trim();
}

export interface BusinessSuggestion {
  placeId: string;
  name: string;
  detail: string;
}

export interface BusinessDetails {
  placeId: string;
  name: string;
  address: string;
  town: string;
  phone: string;
  website: string;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string;
}

async function timedFetch(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const suggestBusinesses = createServerFn({ method: "POST" })
  .validator((data: { q: string; session: string }) =>
    z
      .object({
        q: z.string().trim().min(3).max(120),
        session: z.string().regex(SESSION_RE),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ suggestions: BusinessSuggestion[] }> => {
    const key = mapsKey();
    if (!key || !(await verifyRequestOriginAsync())) return { suggestions: [] };
    const ask = (businessesOnly: boolean) =>
      timedFetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
        body: JSON.stringify({
          input: data.q,
          sessionToken: data.session,
          // Our clients are mostly in the UK and Nigeria.
          includedRegionCodes: ["gb", "ng"],
          ...(businessesOnly ? { includedPrimaryTypes: ["establishment"] } : {}),
        }),
      });
    let res = await ask(true);
    // If Google rejects the business-only filter, ask again without it.
    if (res && res.status === 400) res = await ask(false);
    if (!res || !res.ok) return { suggestions: [] };
    const json = (await res.json().catch(() => ({}))) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string;
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
          text?: { text?: string };
        };
      }[];
    };
    const suggestions: BusinessSuggestion[] = [];
    for (const s of json.suggestions ?? []) {
      const p = s.placePrediction;
      if (!p?.placeId || !PLACE_ID_RE.test(p.placeId)) continue;
      suggestions.push({
        placeId: p.placeId,
        name: (p.structuredFormat?.mainText?.text ?? p.text?.text ?? "").slice(0, 160),
        detail: (p.structuredFormat?.secondaryText?.text ?? "").slice(0, 200),
      });
      if (suggestions.length >= 5) break;
    }
    return { suggestions };
  });

export const getBusinessDetails = createServerFn({ method: "POST" })
  .validator((data: { placeId: string; session: string }) =>
    z
      .object({
        placeId: z.string().regex(PLACE_ID_RE),
        session: z.string().regex(SESSION_RE),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ business: BusinessDetails | null }> => {
    const key = mapsKey();
    if (!key || !(await verifyRequestOriginAsync())) return { business: null };
    const res = await timedFetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(data.placeId)}?sessionToken=${encodeURIComponent(data.session)}`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,addressComponents,nationalPhoneNumber,websiteUri,rating,userRatingCount,googleMapsUri",
        },
      },
    );
    if (!res || !res.ok) return { business: null };
    const p = (await res.json().catch(() => null)) as {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      addressComponents?: { longText?: string; types?: string[] }[];
      nationalPhoneNumber?: string;
      websiteUri?: string;
      rating?: number;
      userRatingCount?: number;
      googleMapsUri?: string;
    } | null;
    if (!p?.id) return { business: null };
    const comp = (type: string) =>
      p.addressComponents?.find((c) => c.types?.includes(type))?.longText ?? "";
    const town =
      comp("postal_town") || comp("locality") || comp("administrative_area_level_2") || "";
    return {
      business: {
        placeId: p.id,
        name: (p.displayName?.text ?? "").slice(0, 160),
        address: (p.formattedAddress ?? "").slice(0, 300),
        town: town.slice(0, 120),
        phone: (p.nationalPhoneNumber ?? "").slice(0, 40),
        website: (p.websiteUri ?? "").slice(0, 300),
        rating: typeof p.rating === "number" ? p.rating : null,
        reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
        mapsUrl: (p.googleMapsUri ?? "").slice(0, 500),
      },
    };
  });
