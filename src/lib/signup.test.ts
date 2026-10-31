import { describe, expect, it } from "vitest";
import { prefillName, reviewUrl, signupProblem, stageAfterSignup } from "./signup";
import { GROWTH, planPence, yearSaving } from "./shop";
import { notInPlanMessage } from "./plan-access";

const ok = {
  business: "Burger Base",
  name: "Sam",
  email: "sam@example.com",
  password: "longenough1",
  agree: true,
};

describe("free sign-up", () => {
  it("accepts a good form", () => expect(signupProblem(ok)).toBeNull());
  it("explains problems simply", () => {
    expect(signupProblem({ ...ok, password: "short" })).toMatch(/10 characters/);
    expect(signupProblem({ ...ok, email: "sam" })).toMatch(/email/);
    expect(signupProblem({ ...ok, agree: false })).toMatch(/terms/);
  });
  it("builds the Google review link", () =>
    expect(reviewUrl("ChIJabc123xyz")).toBe(
      "https://search.google.com/local/writereview?placeid=ChIJabc123xyz",
    ));
  it("prefills the name from the contact, else the owner", () => {
    expect(prefillName(" Dave  Jones ", "John")).toBe("Dave Jones");
    expect(prefillName(null, "John")).toBe("John");
    expect(prefillName("", "J")).toBe("");
  });
  it("marks a prospect who signs up as won", () => {
    expect(stageAfterSignup("sent")).toBe("won");
    expect(stageAfterSignup("booked")).toBe("won");
  });
});

describe("Growth plan", () => {
  it("prices monthly and yearly", () => {
    expect(planPence("month")).toBe(4900);
    expect(planPence("year")).toBe(49700);
    // £49 x 12 = £588, minus £497 = £91 saved.
    expect(yearSaving()).toBe(9100);
    expect(GROWTH.id).toBe("gold");
  });
  it("tells free users how to upgrade", () =>
    expect(notInPlanMessage("growth")).toMatch(/RepSuites Growth.*£49/));
});
