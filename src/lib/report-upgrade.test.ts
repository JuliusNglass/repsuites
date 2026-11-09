import { describe, expect, it } from "vitest";
import { auditHomepage, phoneKey, postcodeOf, websiteScore } from "./website-audit";
import { baselineFrom } from "./prospects.server";
import { shouldAlertOpen } from "./prospect-video.server";
import { assistantName, beforeAfter, reviewStand } from "./report-page.server";
import type { Report } from "./prospects.server";

const bad = `<html><head><title>Home</title></head><body><h1>Professional Electrical Services You Can Trust</h1><p>Call 01633 111222</p></body></html>`;
const good = `<html><head><title>Electrician in Newport | AE Electric</title><meta name="viewport" content="width=device-width"><meta name="description" content="Electrician in Newport"><script type="application/ld+json">{"@type":"Electrician"}</script></head><body><a href="tel:+447700900123">Call</a><h1>Electrician in Newport</h1><p>12 High St, Newport NP20 1AB</p><iframe src="https://www.google.com/maps/embed?pb=x"></iframe></body></html>`;
const google = {
  phone: "07700 900123",
  address: "12 High St, Newport NP20 1AB, UK",
  service: "electrician",
  town: "Newport",
};

describe("website checks against Google", () => {
  it("flags a phone and address mismatch like the video example", () => {
    const a = auditHomepage(bad, "https://x", "2026-11-09", google);
    const f = (id: string) => a.findings.find((x) => x.id === id);
    expect(f("phone_match")?.status).toBe("review");
    expect(f("phone_match")?.evidence).toContain("01633 111222");
    expect(f("address_match")?.status).toBe("review");
    expect(f("local_wording")?.status).toBe("review");
    expect(f("map")?.status).toBe("review");
    expect(websiteScore(a)).toBeLessThan(30);
  });
  it("passes a site that matches Google and scores 100", () => {
    const a = auditHomepage(good, "https://x", "2026-11-09", google);
    expect(a.findings.every((f) => f.status === "pass")).toBe(true);
    expect(websiteScore(a)).toBe(100);
  });
  it("skips comparisons when Google gave nothing to compare", () => {
    const a = auditHomepage(bad, "https://x", "2026-11-09");
    expect(a.findings.some((f) => f.id === "phone_match" || f.id === "address_match")).toBe(false);
  });
  it("matches +44 and 0 formats and reads postcodes", () => {
    expect(phoneKey("+44 7700 900123")).toBe(phoneKey("07700 900123"));
    expect(postcodeOf("12 High St, Newport NP20 1AB")).toBe("NP201AB");
    expect(postcodeOf("Ikeja, Lagos")).toBeNull();
  });
  it("gives no score when the site could not be checked", () => {
    expect(
      websiteScore({ version: 1, checkedAt: "", url: "", status: "unavailable", findings: [] }),
    ).toBeNull();
  });
});

const grid = {
  keyword: "electrician",
  size: 5,
  spacing: "1 km",
  ranks: Array(25).fill(5) as (number | null)[],
  found: 25,
  top3: 2,
  average: 5,
  center: { lat: 51.5, lng: -3 },
  spacingKm: 1,
};

describe("before and after", () => {
  it("keeps the first complete scan, never a partial one", () => {
    expect(baselineFrom(null, grid, "2026-10-01")?.top3).toBe(2);
    expect(
      baselineFrom(null, { ...grid, ranks: [...grid.ranks.slice(1), -1] }, "x"),
    ).toBeUndefined();
    const first = baselineFrom(null, grid, "2026-10-01")!;
    expect(baselineFrom(first, { ...grid, top3: 9 }, "2026-11-01")).toBe(first);
  });
  it("shows the change only for the same search spots", () => {
    const base = baselineFrom(null, grid, "2026-10-01")!;
    const r = {
      baseline: base,
      grids: [{ ...grid, top3: 7 }],
      maps: { keyword: "electrician" },
    } as unknown as Report;
    expect(beforeAfter(r)).toContain("5 more places");
    const moved = {
      ...r,
      grids: [{ ...grid, top3: 7, center: { lat: 52, lng: -3 } }],
    } as unknown as Report;
    expect(beforeAfter(moved)).toBe("");
  });
});

describe("open alerts", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  it("alerts on the first real open and on a return after 3 days", () => {
    expect(
      shouldAlertOpen({ sent_at: "2026-11-09T10:00:00Z", opens: 0, last_opened_at: null }, now),
    ).toBe("first");
    expect(
      shouldAlertOpen(
        { sent_at: "2026-11-01T10:00:00Z", opens: 2, last_opened_at: "2026-11-05T10:00:00Z" },
        now,
      ),
    ).toBe("back");
    expect(
      shouldAlertOpen(
        { sent_at: "2026-11-01T10:00:00Z", opens: 2, last_opened_at: "2026-11-09T09:00:00Z" },
        now,
      ),
    ).toBeNull();
  });
  it("ignores unsent reports and link scanners", () => {
    expect(shouldAlertOpen({ sent_at: null, opens: 0, last_opened_at: null }, now)).toBeNull();
    expect(
      shouldAlertOpen({ sent_at: "2026-11-09T11:59:30Z", opens: 0, last_opened_at: null }, now),
    ).toBeNull();
  });
});

describe("report extras", () => {
  it("names assistants the way customers know them", () => {
    expect(assistantName("Anthropic")).toBe("Claude");
    expect(assistantName("OpenAI")).toBe("ChatGPT");
    expect(assistantName("Perplexity")).toBe("Perplexity");
  });
  it("draws a review stand QR code for the business", () => {
    const html = reviewStand(
      { business: { name: "AE <Electric>", placeId: "ChIJ1" } } as unknown as Report,
      null,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("AE &lt;Electric&gt;");
  });
});
