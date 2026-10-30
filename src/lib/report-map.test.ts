import { describe, expect, it } from "vitest";
import { gridSpots, pinAt, zoomFor } from "./report-map";
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
