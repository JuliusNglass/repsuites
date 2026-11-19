import { describe, expect, it } from "vitest";
import { bookLink, chaseDue, chaseSms } from "./growth-chase";

const created = "2026-11-20T10:00:00Z";
const at = (min: number) => new Date(new Date(created).getTime() + min * 60_000);

describe("chaseDue", () => {
  it("texts at 10 min, next day and day 3, in order", () => {
    expect(chaseDue(created, [], at(5))).toBeNull();
    expect(chaseDue(created, [], at(11))).toBe(1);
    expect(chaseDue(created, [1], at(60))).toBeNull();
    expect(chaseDue(created, [1], at(20 * 60 + 1))).toBe(2);
    expect(chaseDue(created, [1, 2], at(68 * 60 + 1))).toBe(3);
    expect(chaseDue(created, [1, 2, 3], at(80 * 60))).toBeNull();
  });
  it("ignores old leads and leads from before launch", () => {
    expect(chaseDue(created, [], at(97 * 60))).toBeNull();
    expect(chaseDue("2026-11-18T16:44:00Z", [], new Date("2026-11-19T09:00:00Z"))).toBeNull();
  });
});

describe("chaseSms", () => {
  it("is short, about them, branded and STOP-free", () => {
    const link = bookLink({ firstName: "daniel", email: "a@b.co", phone: "+447000000000" });
    expect(link).toContain("growth.accelur8clientwork.com/book?first_name=daniel");
    for (const s of [1, 2, 3] as const) {
      const m = chaseSms(s, "daniel", link);
      expect(m.startsWith("Hi Daniel")).toBe(true);
      expect(m).toMatch(/Accelur8$/);
      expect(m).not.toMatch(/STOP|Julius|—/);
    }
  });
});

describe("free check route for unqualified leads", () => {
  it("routes nurture/solo but not qualified", async () => {
    const { isCheckRoute } = await import("./growth-chase");
    expect(isCheckRoute(["grw-lead", "nurture"])).toBe(true);
    expect(isCheckRoute(["grw-lead", "solo"])).toBe(true);
    expect(isCheckRoute(["grw-lead", "qualified"])).toBe(false);
    expect(isCheckRoute(["grw-lead", "qualified", "nurture"])).toBe(false);
  });
  it("first text has the opt-out, later ones do not, all point at the check", async () => {
    const { checkSms, CHECK_LINK } = await import("./growth-chase");
    expect(checkSms(1, "dee", "Complete cleaning")).toContain("STOP");
    expect(checkSms(1, "dee", "Complete cleaning")).toContain("Hi Dee, when someone near you");
    expect(checkSms(2, "dee", null)).not.toContain("STOP");
    expect(checkSms(3, "dee", null)).toContain(CHECK_LINK);
  });
});
