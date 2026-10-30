import { describe, expect, it } from "vitest";
import { cardLook, chosenStyle, CARD_STYLES } from "./card-style";

const none = { background: null, standTheme: null, primary: null, cardStyle: null };

describe("card style", () => {
  it("uses the QR stand photo by default when there is one", () => {
    const s = { ...none, background: "https://x/bg.jpg", primary: "#cc0000" };
    expect(chosenStyle(s)).toBe("stand");
    expect(cardLook(s)).toEqual({ kind: "photo", url: "https://x/bg.jpg", themeId: "brand" });
  });
  it("falls back to brand colours, then navy", () => {
    expect(chosenStyle({ ...none, primary: "#cc0000" })).toBe("brand");
    expect(cardLook(none)).toEqual({ kind: "theme", themeId: "navy" });
  });
  it("uses the stand's colour theme when there is no photo", () => {
    expect(cardLook({ ...none, standTheme: "forest" })).toEqual({
      kind: "theme",
      themeId: "forest",
    });
  });
  it("respects a chosen catalogue style and ignores unknown ones", () => {
    expect(cardLook({ ...none, cardStyle: "cream" })).toEqual({ kind: "theme", themeId: "cream" });
    expect(chosenStyle({ ...none, cardStyle: "stand" })).toBe("navy");
  });
  it("only offers the stand look when one is saved", () => {
    expect(CARD_STYLES(none).some((x) => x.id === "stand")).toBe(false);
    expect(CARD_STYLES({ ...none, standTheme: "coral" })[0]!.id).toBe("stand");
  });
});
