/* eslint-disable @typescript-eslint/no-explicit-any -- test fixtures */
import { describe, expect, it } from "vitest";
import { checkSummary } from "./report-page.server";
import { ghlLeadTags } from "./ghl-lead";

const base: any = {
  createdAt: "2026-11-17T12:00:00Z",
  business: { name: "Sparkle Clean", address: "1 High St", rating: 4.8, reviews: 11 },
  score: 70,
  parts: [{ label: "Reviews", got: 10, max: 20 }],
  maps: { checked: true, keyword: "cleaners", position: 5 },
  rivals: [
    { name: "Izzy Nest Cleaning", rating: 4.9, reviews: 18, kind: "House cleaning service" },
  ],
  fixes: [
    { title: "Add a business description", why: "", priority: "high" },
    { title: "Add more categories", why: "", priority: "medium" },
    { title: "Get more recent reviews", why: "", priority: "medium" },
    { title: "Add photos", why: "", priority: "low" },
  ],
  reviewGap: null,
  grid: null,
  grids: [{ keyword: "cleaners", ranks: Array(25).fill(5), top3: 7, found: 25, size: 5 }],
};

describe("checkSummary", () => {
  it("gives zones, top 3 gaps and a true review line when behind", () => {
    const s = checkSummary(base);
    expect(s.zones).toBe(7);
    expect(s.gaps).toHaveLength(3);
    expect(s.reviewLine).toContain("Izzy Nest Cleaning has 18 reviews to your 11");
  });
  it("never says you are behind when you are not", () => {
    const s = checkSummary({ ...base, business: { ...base.business, reviews: 40 } });
    expect(s.reviewLine).toBe("Your reviews are a good base to build on");
  });
  it("has no zones when the map check did not finish", () => {
    const s = checkSummary({
      ...base,
      grids: [{ ...base.grids[0], ranks: [-1, ...Array(24).fill(5)] }],
    });
    expect(s.zones).toBeNull();
  });
});

describe("gated check tag", () => {
  it("marks the contact as waiting for SEND", () => {
    const t = ghlLeadTags({
      name: "A B",
      email: "a@b.com",
      phone: "07000000000",
      business: "X",
      town: "",
      niche: "cleaning",
      size: null,
      headaches: [],
      consentEmail: false,
      consentWhatsapp: false,
      reportUrl: null,
      source: "meta",
      scanPending: true,
    });
    expect(t).toContain("gc-scan-pending");
  });
});
