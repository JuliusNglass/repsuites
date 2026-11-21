import { describe, it, expect } from "vitest";
import { monthChoices, validMonth, reminderDue, startSms } from "./growth-month";

const now = new Date("2026-11-21T12:00:00Z");
describe("growth month", () => {
  it("offers the next 6 months", () => {
    expect(monthChoices(now)).toEqual([
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
    ]);
  });
  it("only accepts offered months", () => {
    expect(validMonth("2027-02", now)).toBe(true);
    expect(validMonth("2026-11", now)).toBe(false);
    expect(validMonth("2028-01", now)).toBe(false);
    expect(validMonth("bad", now)).toBe(false);
  });
  it("is due 14 days before the month", () => {
    expect(reminderDue("2027-02", new Date("2027-01-17T23:59:00Z"))).toBe(false);
    expect(reminderDue("2027-02", new Date("2027-01-18T00:00:00Z"))).toBe(true);
  });
  it("writes a short https text with no opt-out line", () => {
    const t = startSms(
      "Caroline Domestry",
      "2027-02",
      "https://growth.accelur8clientwork.com/book",
    );
    expect(t).toContain("Hi Caroline,");
    expect(t).toContain("February 2027");
    expect(t).toContain("https://");
    expect(t).not.toMatch(/STOP|Julius|—/);
  });
});
