import { describe, expect, it } from "vitest";
import { storyCards, storyMode, type StoryInput } from "./report-story";

const s: StoryInput = {
  business: "Steamins Cleaning Services",
  score: 88,
  keyword: "cleaning company",
  ranks: Array.from({ length: 25 }, (_, i) => (i % 3 === 0 ? 1 : i % 3 === 1 ? 7 : null)),
  top3: 9,
  reviews: 10,
  newestReviewDays: 1008,
  leader: { name: "MARTIN CLEANING", reviews: 11 },
  fixes: ["Get fresh reviews", "Add a business description", "Add more categories", "Extra"],
  fixUrl: "/fix?r=tok",
  cleaning: true,
};

describe("story mode", () => {
  it("builds cards from the report's own numbers, ending in the fix offer", () => {
    const c = storyCards(s);
    expect(c).toHaveLength(6);
    expect(c[1]).toContain("Top 3 in 9 of 25 spots");
    expect(c[2]).toContain("MARTIN CLEANING has 11 reviews");
    expect(c[3]).toContain("over 2 years old");
    expect(c[4]).not.toContain("Extra");
    expect(c[5]).toContain("/fix?r=tok");
    expect(c[5]).toContain("SparkOps");
    expect(c.join("")).not.toMatch(/—/);
  });
  it("skips cards it has no data for and escapes names", () => {
    const c = storyCards({ ...s, ranks: null, leader: null, business: "<b>x", cleaning: false });
    expect(c.join("")).not.toContain("<b>x");
    expect(c.join("")).not.toContain("SparkOps");
    expect(c.length).toBe(4);
  });
  it("needs at least 3 cards", () => {
    expect(storyMode({ ...s, ranks: null, leader: null, newestReviewDays: null, fixes: [] }, "t")).toBe("");
    expect(storyMode(s, "tok")).toContain('id="story"');
  });
});
