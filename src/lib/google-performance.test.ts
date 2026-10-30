import { describe, expect, it } from "vitest";
import { change, periods, searchTerms, summarise } from "./google-performance";

describe("Google performance", () => {
  it("adds up this period and the one before", () => {
    const body = {
      multiDailyMetricTimeSeries: [
        {
          dailyMetricTimeSeries: [
            {
              dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
              timeSeries: {
                datedValues: [
                  { date: { year: 2026, month: 10, day: 1 }, value: "10" },
                  { date: { year: 2026, month: 10, day: 20 }, value: "30" },
                ],
              },
            },
            {
              dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
              timeSeries: {
                datedValues: [{ date: { year: 2026, month: 10, day: 21 }, value: "5" }],
              },
            },
            {
              dailyMetric: "CALL_CLICKS",
              timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 22 } }] },
            },
          ],
        },
      ],
    };
    const r = summarise(body, "2026-10-15");
    expect(r.current).toMatchObject({ searchViews: 30, mapsViews: 5, calls: 0 });
    expect(r.previous.searchViews).toBe(10);
  });
  it("works out the change as a percentage", () => {
    expect(change(120, 100)).toBe(20);
    expect(change(50, 100)).toBe(-50);
    expect(change(5, 0)).toBeNull();
  });
  it("lists the top search words, small counts last", () => {
    const t = searchTerms({
      searchKeywordsCounts: [
        { searchKeyword: "cleaners newport", insightsValue: { value: "42" } },
        { searchKeyword: "end of tenancy clean", insightsValue: { threshold: "15" } },
        { searchKeyword: "house cleaning", insightsValue: { value: "60" } },
      ],
    });
    expect(t.map((x) => x.term)).toEqual([
      "house cleaning",
      "cleaners newport",
      "end of tenancy clean",
    ]);
    expect(t[2]).toMatchObject({ under: true, count: 15 });
  });
  it("uses the last 28 full days and the 28 before", () => {
    const p = periods(new Date("2026-10-29T12:00:00Z"));
    expect(p).toEqual({ start: "2026-09-01", split: "2026-09-29", end: "2026-10-26" });
  });
});
