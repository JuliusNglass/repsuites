import { describe, expect, it } from "vitest";
import { bookToken, plusPhone } from "./hq.server";
import { bookLink } from "./growth-chase";

describe("SparkOps booking links for growth leads", () => {
  it("reads the token from a SparkOps booking link", () => {
    const t = "05fd3292172a725dbb0ab6c1f5c5970de238";
    expect(bookToken(`https://ops.accelur8clientwork.com/lead/${t}`)).toBe(t);
    expect(bookToken("https://evil.example/lead/xyz")).toBeNull();
    expect(bookToken(undefined)).toBeNull();
  });
  it("matches GHL phone format", () => {
    expect(plusPhone("07414 060680")).toBe("+447414060680");
    expect(plusPhone("+44 7414 060680")).toBe("+447414060680");
    expect(plusPhone("123")).toBeNull();
  });
  it("adds b= to growth links only when there is a valid token", () => {
    const t = "05fd3292172a725dbb0ab6c1f5c5970de238";
    expect(bookLink({ firstName: "Amy", b: t })).toContain(`b=${t}`);
    expect(bookLink({ firstName: "Amy", b: "bad" })).not.toContain("b=");
    expect(bookLink({ firstName: "Amy" })).toBe(
      "https://growth.accelur8clientwork.com/book?first_name=Amy",
    );
  });
});
