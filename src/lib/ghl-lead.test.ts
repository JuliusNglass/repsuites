import { describe, expect, it } from "vitest";
import { fitTags, ghlLeadBody, ghlLeadTags, type GhlLeadInput } from "./ghl-lead";

const base: GhlLeadInput = {
  name: "Sam Jones",
  email: "sam@example.com",
  phone: "+447700900000",
  business: "Sparkle Cleaners",
  town: "Newport",
  niche: "cleaning",
  size: "6-15",
  headaches: ["hiring"],
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
    expect(ghlLeadTags({ ...base, headaches: ["clients"] })).toContain("route-fixit-pack");
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

describe("several headaches", () => {
  it("tags each one and routes to the call when any is an operations headache", () => {
    const t = ghlLeadTags({ ...base, headaches: ["clients", "checking", "clients"] });
    expect(t).toContain("headache-clients");
    expect(t).toContain("headache-checking");
    expect(t.filter((x) => x === "headache-clients")).toHaveLength(1);
    expect(t).toContain("route-sparkops-call");
  });
  it("sends an owner with only a clients headache to the Fix-It Pack", () => {
    expect(ghlLeadTags({ ...base, headaches: ["clients", "other"] })).toContain("route-fixit-pack");
  });
});

describe("fitTags (report page questions)", () => {
  it("flags a team with an operations headache as a SparkOps fit", () => {
    expect(fitTags("6-15", ["hiring", "clients"])).toEqual([
      "fit-answered",
      "size-6-15",
      "headache-hiring",
      "headache-clients",
      "fit-sparkops",
    ]);
  });
  it("keeps a solo owner on the Fix-It Pack route", () => {
    expect(fitTags("solo", ["admin"])).not.toContain("fit-sparkops");
  });
  it("keeps a team whose only headache is clients on the Fix-It Pack route", () => {
    expect(fitTags("2-5", ["clients"])).not.toContain("fit-sparkops");
  });
});

describe("fitTags week question", () => {
  it("records how they run the week", () => {
    expect(fitTags("2-5", ["admin"], "app")).toContain("runs-app");
  });
});
