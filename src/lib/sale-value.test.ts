import { describe, expect, it } from "vitest";
import {
  money,
  periodsPerYear,
  saleCurrency,
  saleDefault,
  saleFor,
  saleOneLine,
  saleSumLines,
  showsGrowthPrice,
  yearlyValue,
} from "./sale-value";

describe("default sale by niche", () => {
  const pick = (category: string, keywords: string[] = [], name = "") =>
    saleDefault({ category, keywords, name });
  it("reads the Google category first", () => {
    expect(pick("Car wash", ["car valeting"])).toMatchObject({ amount: 15, period: "day" });
    expect(pick("Car detailing service")).toMatchObject({ amount: 40, niche: "car valeting" });
    expect(pick("Coffee shop")).toMatchObject({ amount: 8, period: "day" });
    expect(pick("Hamburger Restaurant")).toMatchObject({ amount: 15 });
    expect(pick("Italian restaurant")).toMatchObject({ amount: 30 });
    expect(pick("Barber shop")).toMatchObject({ amount: 15 });
    expect(pick("Nail salon")).toMatchObject({ amount: 35 });
    expect(pick("Gym")).toMatchObject({ amount: 40, period: "week" });
    expect(pick("House cleaning service")).toMatchObject({ amount: 60, period: "day" });
    expect(pick("Plumber")).toMatchObject({ amount: 150, period: "week" });
    expect(pick("Locksmith")).toMatchObject({ amount: 150, period: "week" });
    expect(pick("Dentist")).toMatchObject({ amount: 60, period: "day" });
    expect(pick("Auto repair shop")).toMatchObject({ amount: 60 });
    expect(pick("Pet groomer")).toMatchObject({ amount: 40, niche: "dog grooming" });
    expect(pick("Driving school")).toMatchObject({ amount: 35 });
  });
  it("falls back to the search phrases, then the name", () => {
    expect(pick("", ["car valeting", "car wash"])).toMatchObject({ amount: 40 });
    expect(pick("Point of interest", [], "Dave's MOT Centre")).toMatchObject({ amount: 60 });
  });
  it("does not match words inside other words", () => {
    expect(pick("", [], "Brown's Cafe")).toMatchObject({ amount: 8 });
    expect(pick("", [], "Wheelchair Hire")).toMatchObject({
      amount: 30,
      niche: "a local business",
    });
  });
  it("uses £30 a day when nothing matches", () => {
    expect(pick("Florist")).toEqual({ amount: 30, period: "day", niche: "a local business" });
  });
  it("uses naira for Nigeria", () => {
    expect(saleDefault({ category: "Car wash" }, "NGN")).toMatchObject({ amount: 5000 });
  });
});

describe("yearly sum", () => {
  it("a day means 6 days a week, 52 weeks", () => {
    expect(periodsPerYear("day")).toBe(312);
    expect(periodsPerYear("week")).toBe(52);
    // £40 x 312 = £12,480
    expect(yearlyValue(40, "day")).toBe(12480);
    // £150 x 52 = £7,800
    expect(yearlyValue(150, "week")).toBe(7800);
  });
  it("shows the worked steps", () => {
    expect(saleSumLines(40, "day", "GBP")).toEqual([
      "1 extra customer a day × £40 = £40 a day",
      "Open 6 days a week: 6 × 52 = 312 days a year",
      "£40 × 312 = £12,480 a year in extra sales",
    ]);
    expect(saleSumLines(150, "week", "GBP")[2]).toBe("£150 × 52 = £7,800 a year in extra sales");
    expect(saleOneLine(40, "day", "GBP")).toBe("1 extra customer a day at £40 = £12,480 a year");
  });
});

describe("money", () => {
  it("adds thousands separators and the right symbol", () => {
    expect(money(12480)).toBe("£12,480");
    expect(money(1560000, "NGN")).toBe("₦1,560,000");
    expect(money(8)).toBe("£8");
  });
  it("picks the currency by address", () => {
    expect(saleCurrency("1 High St, Newport NP20 1AA, UK")).toBe("GBP");
    expect(saleCurrency("12 Allen Ave, Ikeja, Lagos, Nigeria")).toBe("NGN");
    expect(saleCurrency("Main St, Dublin, Ireland")).toBe("GBP");
    expect(showsGrowthPrice("1 High St, Newport NP20 1AA, UK")).toBe(true);
    expect(showsGrowthPrice("Main St, Dublin, Ireland")).toBe(false);
  });
});

describe("saved value wins", () => {
  const report = {
    business: { name: "Sparkle", address: "1 High St, Newport, UK", category: "Car wash" },
    maps: { keyword: "car wash" },
  };
  it("uses the default when nothing is saved", () => {
    expect(saleFor(report)).toMatchObject({ amount: 15, period: "day", saved: false });
  });
  it("uses the saved price and period", () => {
    expect(saleFor(report, { minSalePence: 2500, salePeriod: "week" })).toMatchObject({
      amount: 25,
      period: "week",
      saved: true,
    });
  });
});
