import { describe, expect, it } from "vitest";
import { compareGridBusinesses, summarisePoints } from "./rank-grid";
import { gridInsight } from "./report-map";
import { areaPoints } from "./report-page.server";

const item = (id: string, rank: number, name = id) => ({
  type: "maps_search",
  place_id: id,
  title: name,
  rank_group: rank,
});
describe("ranking evidence", () => {
  it("never counts unknown or malformed ranks as visibility", () => {
    expect(
      summarisePoints([-1, 0, 21, 1.5, 2, null].map((rank) => ({ lat: 0, lng: 0, rank }))),
    ).toEqual({ found: 1, top3: 1, average: 2 });
    const insight = gridInsight(Array(25).fill(-1));
    expect(insight.near.top3).toBe(0);
    expect(insight.weak).toEqual([]);
    expect(areaPoints([{ ranks: [1, -1, null] }])).toBeNull();
  });
  it("uses the actual grid size for a complete area score", () => {
    expect(areaPoints([{ ranks: Array(9).fill(1) }])).toBe(25);
  });
  it("compares matching spots and deduplicates provider entries", () => {
    const rivals = compareGridBusinesses(
      [
        [item("own", 1), item("A", 2), item("A", 2), item("B", 4), item("bad", 0)],
        [item("A", 5), item("B", 1), { ...item("ad", 1), type: "maps_paid_item" }],
      ],
      "own",
    );
    expect(rivals).toEqual([
      { placeId: "B", name: "B", found: 2, top3: 1, average: 2.5 },
      { placeId: "A", name: "A", found: 2, top3: 1, average: 3.5 },
    ]);
  });
});
