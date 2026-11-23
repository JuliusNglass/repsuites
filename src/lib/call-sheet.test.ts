import { describe, expect, it } from "vitest";
import { breakEvenContracts, perDay, YEAR_ONE_COST, yearlyProfit } from "./call-sheet";

describe("call sheet maths", () => {
  it("year one cost is 2000 + 9 x 97", () => expect(YEAR_ONE_COST).toBe(2873));
  it("£100 a week at 25% keeps £1,300 a year", () => expect(yearlyProfit(100, 25)).toBe(1300));
  it("break-even is about 2.2 contracts", () => expect(breakEvenContracts(100, 25)).toBe(2.2));
  it("no maths without numbers", () => {
    expect(breakEvenContracts(0, 25)).toBeNull();
    expect(breakEvenContracts(100, 0)).toBeNull();
  });
  it("per day", () => expect(perDay(2000)).toBe(5.48));
});
