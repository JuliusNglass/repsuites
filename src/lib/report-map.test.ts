import { describe, expect, it } from "vitest";
import { gridInsight, gridSpots, joinSides, pinAt, sideOf, zoomFor } from "./report-map";
import { kmBetween, rivalTypes } from "./prospects.server";

const cwmbran = { lat: 51.654577, lng: -3.0195437 };

describe("report map", () => {
  it("fits a half-mile grid at street level", () => {
    expect(zoomFor(cwmbran.lat, 0.8)).toBe(14);
  });
  it("puts the middle spot in the middle and every spot on the picture", () => {
    const z = zoomFor(cwmbran.lat, 0.8);
    const spots = gridSpots(cwmbran, 5, 0.8);
    const mid = pinAt(cwmbran, z, spots[12]!)!;
    expect(mid.x).toBeCloseTo(50, 5);
    expect(mid.y).toBeCloseTo(50, 5);
    for (const s of spots) expect(pinAt(cwmbran, z, s)).not.toBeNull();
    // North-west corner is up and to the left.
    const nw = pinAt(cwmbran, z, spots[0]!)!;
    expect(nw.x).toBeLessThan(50);
    expect(nw.y).toBeLessThan(50);
  });
  it("hides a rival 15 km away", () => {
    expect(pinAt(cwmbran, 14, { lat: 51.48, lng: -3.18 })).toBeNull();
  });
});

describe("rivals", () => {
  it("uses the specific kinds, not 'restaurant'", () => {
    expect(
      rivalTypes("american_restaurant", [
        "hamburger_restaurant",
        "fast_food_restaurant",
        "restaurant",
        "food",
        "point_of_interest",
        "establishment",
      ]),
    ).toEqual(["american_restaurant", "hamburger_restaurant", "fast_food_restaurant"]);
  });
  it("measures distance", () => {
    // Cwmbran to Cardiff centre is about 22 km.
    const d = kmBetween(cwmbran, { lat: 51.4816, lng: -3.1791 });
    expect(d).toBeGreaterThan(20);
    expect(d).toBeLessThan(25);
  });
});

describe("area size", async () => {
  const { areaSpacingKm, autoAreaSize } = await import("./rank-grid");
  it("cleaners and trades cover a wider area", () => {
    expect(autoAreaSize(["house_cleaning_service"], false)).toBe("large");
    expect(autoAreaSize(["restaurant"], true)).toBe("large");
    expect(autoAreaSize(["hamburger_restaurant", "restaurant"], false)).toBe("medium");
  });
  it("uses clean distances", () => {
    expect(areaSpacingKm("medium", true)).toBe(1.6);
    expect(areaSpacingKm("large", false)).toBe(3);
  });
});

describe("gridInsight", () => {
  it("reads home, rings and weak sides", () => {
    // Top 3 on your street and next to it; nothing along the north row.
    const ranks: (number | null)[] = [
      null,
      null,
      null,
      null,
      null,
      5,
      2,
      2,
      2,
      12,
      8,
      1,
      1,
      2,
      15,
      6,
      2,
      3,
      2,
      14,
      4,
      5,
      6,
      7,
      9,
    ];
    const g = gridInsight(ranks);
    expect(g.home).toBe(1);
    expect(g.near).toEqual({ top3: 8, total: 8 });
    expect(g.far.total).toBe(16);
    expect(g.weak).toContain("north");
    expect(g.weak).toContain("east");
    expect(g.weak).not.toContain("south");
  });
  it("names sides and joins them", () => {
    expect(sideOf({ lat: 51.5, lng: -3 }, { lat: 51.6, lng: -3 })).toBe("north");
    expect(sideOf({ lat: 51.5, lng: -3 }, { lat: 51.5, lng: -2.8 })).toBe("east");
    expect(joinSides(["north", "east", "south"])).toBe("north, east and south");
  });
});
