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
