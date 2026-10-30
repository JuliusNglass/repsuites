/* eslint-disable @typescript-eslint/no-explicit-any -- DataForSEO JSON is checked field by field. */
// Pure helpers for local ranking checks: the grid of points around a
// business, finding the business in Google Maps results, and the summary.

export interface GridPoint {
  lat: number;
  lng: number;
  rank: number | null; // null = not in the top results
}

// Points in a square around the centre, spacingKm apart. Worked example for
// 5 by 5 with 1.5 km spacing: rows and columns at -3, -1.5, 0, 1.5 and 3 km.
// One km north is about 1 / 111.32 of a degree of latitude; one km east is
// that divided by cos(latitude), because lines of longitude get closer
// together away from the equator.
export function gridPoints(center: { lat: number; lng: number }, size: number, spacingKm: number) {
  const half = (size - 1) / 2;
  const kmLat = 1 / 111.32;
  const kmLng = 1 / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const out: { lat: number; lng: number }[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      out.push({
        lat: Math.round((center.lat + (half - r) * spacingKm * kmLat) * 1e7) / 1e7,
        lng: Math.round((center.lng + (c - half) * spacingKm * kmLng) * 1e7) / 1e7,
      });
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Position of the business in one Google Maps result list (1 = top), by
// Google place ID, or by name when the ID is not known.
export function rankIn(items: any[], placeId: string | null, title: string): number | null {
  const list = (items ?? []).filter((i) => i?.type === "maps_search");
  const want = norm(title);
  for (const i of list) {
    if (placeId && i.place_id === placeId) return Number(i.rank_group) || null;
    if (!placeId && want && norm(String(i.title ?? "")) === want)
      return Number(i.rank_group) || null;
  }
  return null;
}

export function summarisePoints(points: GridPoint[]): {
  found: number;
  average: number | null;
  top3: number;
} {
  const ranks = points.map((p) => p.rank).filter((r): r is number => r !== null);
  return {
    found: ranks.length,
    top3: ranks.filter((r) => r <= 3).length,
    // Average of the places where the business shows up, to 1 decimal place.
    average: ranks.length
      ? Math.round((ranks.reduce((t, r) => t + r, 0) / ranks.length) * 10) / 10
      : null,
  };
}

export function cleanKeyword(raw: string): string | null {
  const k = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return k.length >= 2 && k.length <= 80 && /[a-z]/.test(k) ? k : null;
}

// How far apart the 25 search spots are, by how far customers usually come.
// "small": city centre, half a mile apart (furthest spot 1 mile away).
// "medium": shops, cafes and restaurants in a town, 1 mile apart (2 miles).
// "large": businesses that travel to the customer (cleaners, plumbers),
// 2 miles apart (4 miles). Kilometre countries use 0.75, 1.5 and 3 km.
export type AreaSize = "small" | "medium" | "large";

export function areaSpacingKm(size: AreaSize, miles: boolean): number {
  if (miles) return size === "small" ? 0.8 : size === "medium" ? 1.6 : 3.2;
  return size === "small" ? 0.75 : size === "medium" ? 1.5 : 3;
}

// Businesses that go to the customer cover a wider area than ones the
// customer walks into.
const TRAVELS = [
  "plumber",
  "electrician",
  "roofing_contractor",
  "general_contractor",
  "painter",
  "locksmith",
  "moving_company",
  "house_cleaning_service",
  "cleaning_service",
  "pest_control_service",
  "landscaper",
  "gardener",
  "hvac_contractor",
  "carpenter",
];

export function autoAreaSize(types: string[], serviceAreaOnly: boolean): AreaSize {
  if (serviceAreaOnly || types.some((t) => TRAVELS.includes(t))) return "large";
  return "medium";
}
