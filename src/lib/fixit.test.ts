import { describe, expect, it } from "vitest";
import { cleanToken, FIXIT_FAQ, FIXIT_INCLUDES, FIXIT_PENCE } from "./fixit";

describe("fixit", () => {
  it("accepts report tokens and rejects anything else", () => {
    expect(cleanToken("abcDEF123_-abcDEF123_")).toBe("abcDEF123_-abcDEF123_");
    expect(cleanToken("short")).toBeNull();
    expect(cleanToken("bad token with spaces and more")).toBeNull();
    expect(cleanToken(undefined)).toBeNull();
  });
  it("is £27 and has no em dashes in its copy", () => {
    expect(FIXIT_PENCE).toBe(2700);
    const copy = [...FIXIT_INCLUDES, ...FIXIT_FAQ.flat()].join(" ");
    expect(copy).not.toMatch(/—/);
  });
});
