import { describe, expect, it } from "vitest";
import { naira, nairaPerDay, ngAmountKobo, pickNgPrice } from "./fixit-ng";
import { normaliseNgPhone } from "./fixit-ng.functions";

describe("Nigeria Fix-it Pack", () => {
  it("prices both test arms and the done-for-you option in kobo", () => {
    expect(ngAmountKobo(10, "diy")).toBe(1_000_000);
    expect(ngAmountKobo(20, "diy")).toBe(2_000_000);
    expect(ngAmountKobo(10, "dfy")).toBe(2_500_000);
    expect(naira(2_500_000)).toBe("₦25,000");
  });
  it("shows a tiny daily figure", () => {
    expect(nairaPerDay(1_000_000)).toBe("about ₦28 a day");
    expect(nairaPerDay(2_000_000)).toBe("about ₦55 a day");
  });
  it("respects the ad's price and never invents another", () => {
    expect(pickNgPrice("20")).toBe(20);
    expect([10, 20]).toContain(pickNgPrice(undefined));
  });
  it("turns local numbers into +234", () => {
    expect(normaliseNgPhone("0803 573 1148")).toBe("+2348035731148");
    expect(normaliseNgPhone("+447438881617")).toBe("+447438881617");
  });
});
