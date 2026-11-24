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

import { contractsToCover } from "./call-sheet";
describe("contracts to cover the launch", () => {
  it("£100 a week, 25% kept, 6 months each: about 3.1 contracts", () =>
    expect(contractsToCover(100, 25, 26)).toBe(3.1));
  it("3 months each needs about twice as many", () =>
    expect(contractsToCover(100, 25, 13)).toBe(6.2));
  it("no numbers, no answer", () => expect(contractsToCover(0, 25, 26)).toBeNull());
});
