/* eslint-disable @typescript-eslint/no-explicit-any -- test fixtures */
import { describe, expect, it } from "vitest";
import { rankBand, rankLegend, rankText, rankWords, readingToggle } from "./reading";
import { renderReport } from "./report-page.server";

describe("rank pins", () => {
  it("puts each rank in a band with its own shape class", () => {
    expect(rankBand(1)).toBe("top3");
    expect(rankBand(3)).toBe("top3");
    expect(rankBand(4)).toBe("near");
    expect(rankBand(10)).toBe("near");
    expect(rankBand(11)).toBe("far");
    expect(rankBand(null)).toBe("missing");
    expect(rankBand(-1)).toBe("unknown");
  });
  it("shows a dash when not in the top 20 and says it in words", () => {
    expect(rankText(null)).toBe("–");
    expect(rankWords(null)).toBe("not in the top 20");
    expect(rankWords(2)).toBe("number 2 (top 3)");
  });
  it("labels every band in the legend, with no em dashes", () => {
    const l = rankLegend();
    for (const t of ["Top 3", "4 to 10", "11 to 20", "Not in the top 20"]) expect(l).toContain(t);
    expect(l + readingToggle()).not.toContain("—");
  });
});

describe("report reading comfort", () => {
  const report: any = {
    createdAt: "2026-10-30T12:00:00Z",
    business: { name: "Test Cafe", address: "1 High St", rating: 4.5, reviews: 40 },
    score: 62,
    parts: [{ label: "Reviews", got: 10, max: 20 }],
    maps: { checked: false, keyword: "cafe", position: null },
    rivals: [],
    fixes: [{ title: "Get more reviews", why: "They help.", priority: "high" }],
    reviewGap: null,
    grid: null,
  };
  it("has the Easier reading switch and says the priority of each fix in words", () => {
    const h = renderReport(report, { token: "a".repeat(24), snapshot: null, flash: "" });
    expect(h).toContain("Easier reading");
    expect(h).toContain("Do this first");
    expect(h).not.toContain("text-transform:uppercase");
  });
});
