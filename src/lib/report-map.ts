// Pure helpers for the map on the shareable report: which Google map to
// fetch (centre and zoom), and where each pin sits on it, as a percentage
// across and down the picture. Client-safe.

export const MAP_PX = 640; // Google Static Maps picture, before scale 2

// Metres covered by one pixel at this latitude and zoom.
// Worked example: at the equator, zoom 0, one 256-pixel tile covers the
// whole world (about 40,075 km), so 1 pixel is about 156,543 metres. Each
// zoom step halves that, and it shrinks with cos(latitude) away from the equator.
export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

// The closest zoom that still fits the whole 5 by 5 grid (2 steps each way
// from the middle) with a margin for the pins.
export function zoomFor(lat: number, spacingKm: number): number {
  const needMetres = 2.2 * spacingKm * 1000; // half the width we must show
  const z = Math.floor(
    Math.log2((156543.03 * Math.cos((lat * Math.PI) / 180) * (MAP_PX / 2)) / needMetres),
  );
  return Math.max(10, Math.min(17, z));
}

function worldY(lat: number, zoom: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return 256 * 2 ** zoom * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI));
}

// Position of a point on the picture, 0 to 100 across (x) and down (y).
// null when it falls outside the picture.
export function pinAt(
  center: { lat: number; lng: number },
  zoom: number,
  pt: { lat: number; lng: number },
): { x: number; y: number } | null {
  const scale = (256 * 2 ** zoom) / 360;
  const dx = (pt.lng - center.lng) * scale;
  const dy = worldY(pt.lat, zoom) - worldY(center.lat, zoom);
  const x = 50 + (dx / MAP_PX) * 100;
  const y = 50 + (dy / MAP_PX) * 100;
  return x < 2 || x > 98 || y < 2 || y > 98 ? null : { x, y };
}

// The same grid of search spots the report used (row by row from the
// north-west), so pins line up with the ranks.
export function gridSpots(center: { lat: number; lng: number }, size: number, spacingKm: number) {
  const half = (size - 1) / 2;
  const kmLat = 1 / 111.32;
  const kmLng = 1 / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const out: { lat: number; lng: number }[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      out.push({
        lat: center.lat + (half - r) * spacingKm * kmLat,
        lng: center.lng + (c - half) * spacingKm * kmLng,
      });
  return out;
}

// What the 5 by 5 map says beyond "X of 25": how you do on your own street,
// one step out and two steps out, and which sides of you are weakest.
// Ranks are row by row from the north-west; the middle (index 12) is you.
export type Side = "north" | "south" | "east" | "west";

export function gridInsight(ranks: (number | null)[], size = 5) {
  const half = (size - 1) / 2;
  const home = ranks[half * size + half] ?? null;
  const ring = (step: number) => {
    let top3 = 0;
    let total = 0;
    ranks.forEach((v, i) => {
      const r = Math.floor(i / size) - half;
      const c = (i % size) - half;
      if (Math.max(Math.abs(r), Math.abs(c)) !== step) return;
      total++;
      if (v !== null && v <= 3) top3++;
    });
    return { top3, total };
  };
  // A side is weak when at least 3 in 5 of its outer spots are worse than 10th.
  const weak: Side[] = [];
  const bad = (v: number | null) => v === null || v > 10;
  const sides: [Side, (r: number, c: number) => boolean][] = [
    ["north", (r) => r === -half],
    ["south", (r) => r === half],
    ["west", (_r, c) => c === -half],
    ["east", (_r, c) => c === half],
  ];
  for (const [side, on] of sides) {
    const cells = ranks.filter((_v, i) => on(Math.floor(i / size) - half, (i % size) - half));
    if (cells.length && cells.filter(bad).length / cells.length >= 0.6) weak.push(side);
  }
  return { home, near: ring(1), far: ring(2), weak };
}

// Which side of the centre a point is on (the bigger of the two differences).
export function sideOf(
  center: { lat: number; lng: number },
  pt: { lat: number; lng: number },
): Side {
  const dy = pt.lat - center.lat;
  const dx = (pt.lng - center.lng) * Math.cos((center.lat * Math.PI) / 180);
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? "north" : "south";
  return dx >= 0 ? "east" : "west";
}

// "north", "north and east", "north, east and south".
export function joinSides(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
