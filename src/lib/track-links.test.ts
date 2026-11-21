import { describe, expect, it } from "vitest";
import { CONTACT_RE, LINKS, target } from "./track-links";

describe("tracked links", () => {
  it("every target is https", () => {
    for (const u of Object.values(LINKS)) expect(u.startsWith("https://")).toBe(true);
  });
  it("adds the first name only to growth pages", () => {
    expect(target("commercial", "Victor")).toContain("&first_name=Victor");
    expect(target("busy", "Victor")).toBe("https://youtu.be/ZJnUYly_b4A");
    expect(target("nope")).toBeNull();
  });
  it("accepts GHL contact ids only", () => {
    expect(CONTACT_RE.test("AW0cv1dzWxA84dEcMtin")).toBe(true);
    expect(CONTACT_RE.test("x'; drop")).toBe(false);
  });
});
