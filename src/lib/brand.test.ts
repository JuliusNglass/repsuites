import { describe, expect, it } from "vitest";
import { brandTheme, normaliseHex, textOn } from "./brand";

describe("brand colours", () => {
  it("accepts common hex spellings", () => {
    expect(normaliseHex("#0B1D3A")).toBe("#0b1d3a");
    expect(normaliseHex("f5b324")).toBe("#f5b324");
    expect(normaliseHex("#abc")).toBe("#aabbcc");
    expect(normaliseHex("navy")).toBeNull();
  });
  it("picks readable text", () => {
    expect(textOn("#0b1d3a")).toBe("#ffffff");
    expect(textOn("#fff3c4")).toBe("#0f172a");
  });
  it("keeps the highlight visible", () => {
    expect(brandTheme("#0b1d3a", "#0c1e3b").accent).toBe("#ffffff");
    expect(brandTheme("#0b1d3a", "#f5b324").accent).toBe("#f5b324");
  });
});
