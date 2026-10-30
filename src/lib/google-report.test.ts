import { describe, expect, it } from "vitest";
import {
  monthPeriods,
  reportHtml,
  reportRows,
  reportSubject,
  reportText,
  type ReportData,
} from "./google-report";

const data: ReportData = {
  business: "Home Again",
  title: "Home Again Cleaning <Cwmbran>",
  monthLabel: "October 2026",
  current: { searchViews: 120, mapsViews: 40, calls: 6, websiteClicks: 9, directions: 0 },
  previous: { searchViews: 100, mapsViews: 50, calls: 6, websiteClicks: 0, directions: 0 },
  reviews: { now: 3, before: 1, avgNow: 4.7, avgBefore: 5 },
  searchTerms: [{ term: "cleaners cwmbran", count: 42, under: false }],
};

describe("monthly Google report", () => {
  it("covers last month against the month before", () => {
    const p = monthPeriods(new Date("2026-11-04T09:00:00Z"));
    expect(p).toMatchObject({
      start: "2026-09-01",
      split: "2026-10-01",
      end: "2026-10-31",
      key: "2026-10",
    });
    expect(monthPeriods(new Date("2027-01-04T09:00:00Z"))).toMatchObject({
      start: "2026-11-01",
      split: "2026-12-01",
      end: "2026-12-31",
      key: "2026-12",
    });
  });
  it("says up, down, new or no change in plain words", () => {
    const rows = reportRows(data);
    expect(rows[0]).toEqual(["Seen on Google Search", 120, "up 20%"]);
    expect(rows[1]![2]).toBe("down 20%");
    expect(rows[2]![2]).toBe("no change");
    expect(rows[3]![2]).toBe("new");
    expect(rows[4]![2]).toBe("no change");
  });
  it("writes the email safely, with no dashes or software names", () => {
    expect(reportSubject(data)).toBe("Your Google profile in October 2026");
    const html = reportHtml(data);
    expect(html).toContain("&lt;Cwmbran&gt;");
    expect(html).toContain("cleaners cwmbran");
    for (const t of [html, reportText(data)]) expect(t).not.toMatch(/[—–]|RepSuites/);
  });
});
