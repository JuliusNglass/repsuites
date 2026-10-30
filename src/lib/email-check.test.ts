import { describe, expect, it } from "vitest";
import { codeOk, newCode } from "./email-check";

describe("email code", () => {
  it("is always 6 digits", () => {
    for (let i = 0; i < 200; i++) expect(codeOk(newCode())).toBe(true);
  });
  it("rejects anything else", () => {
    expect(codeOk("12345")).toBe(false);
    expect(codeOk("12a456")).toBe(false);
    expect(codeOk(" 123456 ")).toBe(true);
  });
});
