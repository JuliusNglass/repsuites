import { describe, expect, it } from "vitest";
import { compareGridBusinesses, summarisePoints, sameSearchSpots } from "./rank-grid";
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
      { placeId: "B", name: "B", found: 2, top3: 1, average: 2.5, ranks: [4, 1] },
      { placeId: "A", name: "A", found: 2, top3: 1, average: 3.5, ranks: [2, 5] },
    ]);
  });
  it("keeps a null for spots where a competitor was not found", () => {
    expect(compareGridBusinesses([[item("A", 2)], [item("B", 3)]], "own")).toEqual([
      { placeId: "A", name: "A", found: 1, top3: 1, average: 2, ranks: [2, null] },
      { placeId: "B", name: "B", found: 1, top3: 1, average: 3, ranks: [null, 3] },
    ]);
  });
});

describe("comparable ranking history", () => {
  const scan = {
    gridSize: 3,
    points: Array.from({ length: 9 }, (_, i) => ({ lat: 51 + i * 0.001, lng: 0, rank: i + 1 })),
  };
  it("allows changed rankings at the same search spots", () => {
    expect(
      sameSearchSpots(scan, { ...scan, points: scan.points.map((p) => ({ ...p, rank: null })) }),
    ).toBe(true);
  });
  it("rejects a moved centre, different spacing or grid size", () => {
    expect(
      sameSearchSpots(scan, {
        ...scan,
        points: scan.points.map((p) => ({ ...p, lat: p.lat + 0.01 })),
      }),
    ).toBe(false);
    expect(sameSearchSpots(scan, { ...scan, gridSize: 5 })).toBe(false);
    expect(
      sameSearchSpots(scan, {
        ...scan,
        points: scan.points.map((p, i) => ({ ...p, lng: i * 0.002 })),
      }),
    ).toBe(false);
  });
  it("rejects incomplete or unknown observations", () => {
    expect(sameSearchSpots(scan, { ...scan, points: scan.points.slice(1) })).toBe(false);
    expect(
      sameSearchSpots(scan, { ...scan, points: scan.points.map((p) => ({ ...p, rank: -1 })) }),
    ).toBe(false);
  });
});

