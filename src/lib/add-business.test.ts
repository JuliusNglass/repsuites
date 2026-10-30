import { describe, expect, it } from "vitest";
import { addBusinessProblem, addedNote, featuresFor, isAddPlan } from "./add-business";

describe("add a business helpers", () => {
  it("gives each plan its features", () => {
    expect(featuresFor("free")).toEqual([]);
    expect(featuresFor("gold")).toEqual(["ranking", "ai_visibility", "nfc", "growth"]);
    expect(featuresFor("managed")).toContain("managed");
  });

  it("knows the plans", () => {
    expect(isAddPlan("free")).toBe(true);
    expect(isAddPlan("pro")).toBe(false);
  });

  it("checks the form", () => {
    expect(addBusinessProblem({ name: "A", plan: "free" })).toBe("Add the business name.");
    expect(addBusinessProblem({ name: "Cafe", plan: "free", ownerEmail: "nope" })).toBe(
      "Check the owner's email address.",
    );
    expect(addBusinessProblem({ name: "Cafe", plan: "x" })).toBe("Pick a plan.");
    expect(addBusinessProblem({ name: "Cafe", plan: "gold", ownerEmail: "a@b.co" })).toBeNull();
    expect(addBusinessProblem({ name: "Cafe", plan: "free", ownerEmail: "" })).toBeNull();
  });

  it("adds a dated note", () => {
    const d = new Date("2026-10-30T12:00:00Z");
    expect(addedNote(null, d)).toBe("Added as client 30 Oct 2026");
    expect(addedNote("Called", d)).toBe("Called\nAdded as client 30 Oct 2026");
  });

  it("has no em dashes in copy", () => {
    expect(addedNote(null, new Date()).includes(String.fromCharCode(0x2014))).toBe(false);
  });
});
