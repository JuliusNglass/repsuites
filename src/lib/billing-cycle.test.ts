import { describe, expect, it } from "vitest";
import {
  addDays,
  daysInMonth,
  firstAfter,
  monthlyAnchor,
  monthlyTrial,
  nineAmLondon,
} from "./billing-cycle";

describe("monthly plans on the 1st", () => {
  it("mid-month: anchor on the next 1st, part-month charge now", () => {
    expect(monthlyAnchor("2026-11-15")).toEqual({
      billing_cycle_anchor: nineAmLondon("2026-12-01"),
      proration_behavior: "create_prorations",
    });
  });
  it("on the 1st: full price now", () => expect(monthlyAnchor("2026-11-01")).toEqual({}));
  it("year end and UK summer time", () => {
    expect(firstAfter("2026-12-31")).toBe("2027-01-01");
    expect(nineAmLondon("2026-07-01")).toBe(Date.parse("2026-07-01T08:00:00Z") / 1000);
    expect(nineAmLondon("2026-12-01")).toBe(Date.parse("2026-12-01T09:00:00Z") / 1000);
  });
});

describe("14-day free trial on monthly plans", () => {
  it("worked example: trial from 20 Nov ends 4 Dec, £44.26 for 4 to 31 Dec, then £49 on 1 Jan", () => {
    // 4 to 31 December is 31 - 4 + 1 = 28 days. £49 x 28 / 31 = £44.258... = £44.26.
    expect(monthlyTrial("2026-11-20", 4900)).toEqual({
      trialEnds: "2026-12-04",
      trialEnd: Date.parse("2026-12-04T09:00:00Z") / 1000,
      anchor: Date.parse("2027-01-01T09:00:00Z") / 1000,
      firstPaymentDays: 28,
      monthDays: 31,
      firstPence: 4426,
      fullFrom: "2027-01-01",
    });
    expect(monthlyTrial("2026-11-20", 9900).firstPence).toBe(8942); // £99 x 28 / 31
  });
  it("a trial ending on the 1st: full price that day, no anchor needed", () => {
    const t = monthlyTrial("2026-11-17", 4900);
    expect(t.trialEnds).toBe("2026-12-01");
    expect(t.anchor).toBeNull();
    expect(t.firstPence).toBe(4900);
    expect(t.fullFrom).toBe("2026-12-01");
  });
  it("UK summer time, February and the year end", () => {
    const summer = monthlyTrial("2026-06-20", 4900);
    expect(summer.trialEnd).toBe(Date.parse("2026-07-04T08:00:00Z") / 1000);
    expect(summer.anchor).toBe(Date.parse("2026-08-01T08:00:00Z") / 1000);
    // 15 to 28 February 2027 is 14 of 28 days: £24.50.
    expect(monthlyTrial("2027-02-01", 4900)).toMatchObject({
      trialEnds: "2027-02-15",
      monthDays: 28,
      firstPaymentDays: 14,
      firstPence: 2450,
    });
    expect(monthlyTrial("2026-12-25", 4900).trialEnds).toBe("2027-01-08");
    expect(addDays("2028-02-20", 14)).toBe("2028-03-05");
    expect(daysInMonth("2028-02-10")).toBe(29);
  });
});
