import { describe, expect, it } from "vitest";
import { briefText, checkBrief } from "./video-order";

describe("checkBrief", () => {
  it("needs a name, business, one customer and a goal", () => {
    expect(checkBrief({}).ok).toBe(false);
    expect(checkBrief({ name: "Ann", business: "Shine", c1: "Busy mums", goal: "nope" }).ok).toBe(
      false,
    );
  });
  it("keeps up to three customers and drops empty ones", () => {
    const r = checkBrief({
      name: " Ann  Lee ",
      business: "Shine",
      c1: "Busy mums",
      c2: "",
      c3: "Landlords",
      goal: "sales",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.brief.name).toBe("Ann Lee");
      expect(r.brief.customers).toEqual(["Busy mums", "Landlords"]);
      expect(briefText(r.brief, "three", "a@b.co")).toContain("Pack: 3 explainer videos");
    }
  });
});
