/* eslint-disable @typescript-eslint/no-explicit-any -- test fixtures */
import { describe, expect, it } from "vitest";
import { renderReport } from "./report-page.server";

const report: any = {
  createdAt: "2026-10-30T12:00:00Z",
  business: { name: "Test Cafe", address: "1 High St", rating: 4.5, reviews: 40 },
  score: 62,
  parts: [{ label: "Reviews", got: 10, max: 20 }],
  maps: { checked: false, keyword: "cafe", position: null },
  rivals: [],
  fixes: [],
  reviewGap: null,
  grid: null,
};
const snap: any = {
  at: "2026-10-30T12:00:00Z",
  title: "Test Cafe",
  period: { start: "2026-05-01", split: "2026-07-30", end: "2026-10-27" },
  current: { searchViews: 900, mapsViews: 300, calls: 26, websiteClicks: 40, directions: 64 },
  previous: { searchViews: 800, mapsViews: 200, calls: 20, websiteClicks: 30, directions: 50 },
  searchMonth: "September 2026",
  searchTerms: [{ term: "cafe newport", count: 120, under: false }],
};

describe("report real numbers", () => {
  it("invites the owner to connect when there are no figures", () => {
    const h = renderReport(report, { token: "a".repeat(24), snapshot: null, flash: "" });
    expect(h).toContain("See my real numbers");
    expect(h).toContain("/api/prospect-connect?r=");
  });
  it("shows the figures with a worked example", () => {
    const h = renderReport(report, { token: "a".repeat(24), snapshot: snap, flash: "connected" });
    expect(h).toContain("1,200");
    expect(h).toContain("10 people a week");
    expect(h).toContain("Up from 1,000");
    expect(h).toContain("cafe newport");
    expect(h).not.toContain("—");
  });
  it("opens the print dialog for a PDF", () => {
    expect(
      renderReport(report, { token: "a".repeat(24), snapshot: null, flash: "print" }),
    ).toContain("print()");
  });
});

describe("score uses the whole area", async () => {
  const { areaPoints, scoreView } = await import("./report-page.server");
  it("works out area points", () => {
    // 6 in the top 3 and 10 at 4th to 10th: (6 + 4) / 25 x 25 = 10
    const ranks = [...Array(6).fill(1), ...Array(10).fill(5), ...Array(9).fill(null)];
    expect(areaPoints([{ ranks }])).toBe(10);
  });
  it("a phrase where you are nowhere pulls the score down and adds a fix", () => {
    const r = {
      ...report,
      score: 91,
      parts: [
        { label: "Star rating", got: 20, max: 25 },
        { label: "Position on Google Maps", got: 25, max: 25 },
      ],
      grids: [
        { keyword: "burger", ranks: Array(25).fill(1), top3: 25, found: 25, size: 5 },
        { keyword: "fast food", ranks: Array(25).fill(null), top3: 0, found: 0, size: 5 },
      ],
    };
    const v = scoreView(r);
    expect(v.score).toBeLessThan(91);
    expect(v.fixes.some((f) => f.title.includes("fast food"))).toBe(true);
    const h = renderReport(r, { token: "a".repeat(24), snapshot: null, flash: "" });
    expect(h).toContain("What we found");
    expect(h.indexOf("What we found")).toBeLessThan(h.indexOf("How we worked out your score"));
  });
});
