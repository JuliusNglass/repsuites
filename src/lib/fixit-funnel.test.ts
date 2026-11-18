import { describe, expect, it } from "vitest";
import { PACK27_FAQ, PACK27_INCLUDES, perDay } from "./fixit";

describe("£49 funnel copy", () => {
  it("breaks prices into a daily figure", () => {
    expect(perDay(4900)).toBe("about 13p a day");
    expect(perDay(9900 * 12)).toBe("about £3.25 a day");
    expect(perDay(49700)).toBe("about £1.36 a day");
  });
  it("has no em dashes and promises templates, not replies", () => {
    const all = [...PACK27_INCLUDES, ...PACK27_FAQ.flat()].join(" ");
    expect(all).not.toMatch(/—/);
    expect(all).toMatch(/reply templates/i);
    expect(all).toMatch(/30 minutes/);
  });
});
