import { describe, expect, it } from "vitest";
import { rankUpdateHtml, topNames } from "./rank-tracking.server";

describe("weekly ranking update", () => {
  it("lists the top names at the business's spot, leaving the business out", () => {
    const items = [
      { type: "maps_search", title: "Shine Co", place_id: "a" },
      { type: "maps_search", title: "Us Ltd", place_id: "me" },
      { type: "maps_search", title: "Bright", place_id: "b" },
      { type: "maps_search", title: "Clean Pro", place_id: "c" },
    ];
    expect(topNames(items, "me", "Us Ltd")).toEqual(["Shine Co", "Bright", "Clean Pro"]);
  });
  it("explains the change since last week", () => {
    const html = rankUpdateHtml({
      first: "Ann",
      name: "Us Ltd",
      keyword: "cleaner",
      total: 25,
      found: 12,
      average: 4.2,
      top3: 5,
      before: { found: 9, average: 6.1 },
      leaders: ["Shine Co"],
    });
    expect(html).toContain("3 more of the 25 spots");
    expect(html).toContain("from 6.1 to 4.2");
    expect(html).toContain("Shine Co");
    expect(html).not.toMatch(/—/);
  });
});
