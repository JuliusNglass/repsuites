import { describe, expect, it } from "vitest";
import { prospectSearchTopic } from "./prospect-search-topic";

describe("prospectSearchTopic", () => {
  it("keeps the searched service and removes an unpunctuated UK location", () => {
    expect(
      prospectSearchTopic(
        "cleaning company Birmingham UK",
        "Nita's Cleaning Services",
        "6 Salstar Cl, Birmingham B6 4PP",
      ),
    ).toBe("cleaning company");
  });

  it("removes locations introduced by in or near", () => {
    expect(prospectSearchTopic("auto detailing in Newport", "Shine Cars")).toBe("auto detailing");
  });

  it("does not turn a direct business-name lookup into a keyword", () => {
    expect(prospectSearchTopic("Nita's Cleaning Services", "Nita's Cleaning Services")).toBe("");
  });
});
