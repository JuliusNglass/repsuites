import { describe, expect, it } from "vitest";
import { firstAfter, monthlyAnchor, nineAmLondon } from "./billing-cycle";

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
