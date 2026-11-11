import { describe, expect, it } from "vitest";
import { ghlLeadBody, ghlLeadTags, type GhlLeadInput } from "./ghl-lead";

const base: GhlLeadInput = {
  name: "Sam Jones",
  email: "sam@example.com",
  phone: "+447700900000",
  business: "Sparkle Cleaners",
  town: "Newport",
  niche: "cleaning",
  size: "6-15",
  headache: "hiring",
  consentEmail: true,
  consentWhatsapp: false,
  reportUrl: "https://repsuites.com/r/abc",
  source: "meta",
};

describe("ghlLeadTags", () => {
  it("tags niche, size, headache, consent and route", () => {
    expect(ghlLeadTags(base)).toEqual([
      "free-check",
      "niche-cleaning",
      "src-meta",
      "size-6-15",
      "headache-hiring",
      "consent-email",
      "route-sparkops-call",
    ]);
  });
  it("sends solo owners and client-finding headaches to the Fix-It Pack", () => {
    expect(ghlLeadTags({ ...base, size: "solo" })).toContain("route-fixit-pack");
    expect(ghlLeadTags({ ...base, headache: "clients" })).toContain("route-fixit-pack");
  });
});

describe("ghlLeadBody", () => {
  it("splits the name and carries the report link", () => {
    const b = ghlLeadBody(base);
    expect(b.firstName).toBe("Sam");
    expect(b.lastName).toBe("Jones");
    expect(b.website).toBe("https://repsuites.com/r/abc");
  });
});
