import { describe, expect, it } from "vitest";
import { chooseReportKeyword } from "./prospect-keyword";

describe("chooseReportKeyword", () => {
  it("prefers the user's search topic to a generic Google category", () => {
    expect(chooseReportKeyword({ topic: "cleaning company", category: "Services" })).toBe(
      "cleaning company",
    );
  });

  it("keeps an explicitly entered report phrase as the highest priority", () => {
    expect(
      chooseReportKeyword({
        keyword: "end of tenancy cleaning",
        topic: "cleaning company",
        category: "Services",
      }),
    ).toBe("end of tenancy cleaning");
  });
});
