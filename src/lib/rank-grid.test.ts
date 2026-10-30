import { describe, expect, it } from "vitest";
import { cleanKeyword, gridPoints, rankIn, summarisePoints } from "./rank-grid";

describe("ranking grid", () => {
  it("lays out a square of points around the business", () => {
    const g = gridPoints({ lat: 51.5842, lng: -2.9977 }, 5, 1.5);
    expect(g).toHaveLength(25);
    expect(g[12]).toEqual({ lat: 51.5842, lng: -2.9977 }); // the middle point is the business
    // Top row is 3 km north: about 3 / 111.32 = 0.027 degrees.
    expect(g[0]!.lat - 51.5842).toBeCloseTo(0.02695, 4);
    // Left column is 3 km west, a bigger change in longitude this far north.
    expect(51.5842 - g[0]!.lat).toBeLessThan(0);
    expect(-2.9977 - g[0]!.lng).toBeGreaterThan(0.04);
    expect(gridPoints({ lat: 51.5, lng: -3 }, 3, 2)).toHaveLength(9);
  });
  it("finds the business by place ID, or by name", () => {
    const items = [
      { type: "maps_paid_item", place_id: "P0", title: "Ad", rank_group: 1 },
      { type: "maps_search", place_id: "P1", title: "Other Cleaners", rank_group: 1 },
      { type: "maps_search", place_id: "P2", title: "Home Again Cleaning", rank_group: 2 },
    ];
    expect(rankIn(items, "P2", "")).toBe(2);
    expect(rankIn(items, null, "home again cleaning!")).toBe(2);
    expect(rankIn(items, "P9", "Home Again Cleaning")).toBeNull();
    expect(rankIn(items, "P0", "")).toBeNull();
  });
  it("sums up the grid", () => {
    const s = summarisePoints([
      { lat: 0, lng: 0, rank: 1 },
      { lat: 0, lng: 0, rank: 4 },
      { lat: 0, lng: 0, rank: null },
      { lat: 0, lng: 0, rank: 2 },
    ]);
    // Average of 1, 4 and 2 = 7 / 3 = 2.33, rounded to 2.3.
    expect(s).toEqual({ found: 3, top3: 2, average: 2.3 });
  });
  it("tidies searches", () => {
    expect(cleanKeyword("  Cleaners   NEWPORT ")).toBe("cleaners newport");
    expect(cleanKeyword("a")).toBeNull();
    expect(cleanKeyword("1234")).toBeNull();
  });
});
