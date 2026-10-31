/* eslint-disable @typescript-eslint/no-explicit-any -- test fixtures */
import { describe, expect, it } from "vitest";
import { renderReport } from "./report-page.server";

const report: any = {
  createdAt: "2026-10-30T12:00:00Z",
  business: { name: "Test Cafe", address: "1 High St", rating: 4.5, reviews: 40 },
  score: 62,
  parts: [{ label: "Reviews", got: 10, max: 20 }],
  maps: { checked: false, keyword: "cafe", position: null },
  rivals: [],
  fixes: [],
  reviewGap: null,
  grid: null,
};
const snap: any = {
  at: "2026-10-30T12:00:00Z",
  title: "Test Cafe",
  period: { start: "2026-05-01", split: "2026-07-30", end: "2026-10-27" },
  current: { searchViews: 900, mapsViews: 300, calls: 26, websiteClicks: 40, directions: 64 },
  previous: { searchViews: 800, mapsViews: 200, calls: 20, websiteClicks: 30, directions: 50 },
  searchMonth: "September 2026",
  searchTerms: [{ term: "cafe newport", count: 120, under: false }],
};

describe("report real numbers", () => {
  it("invites the owner to connect when there are no figures", () => {
    const h = renderReport(report, { token: "a".repeat(24), snapshot: null, flash: "" });
    expect(h).toContain("See my real numbers");
    expect(h).toContain("/api/prospect-connect?r=");
  });
  it("shows the figures with a worked example", () => {
    const h = renderReport(report, { token: "a".repeat(24), snapshot: snap, flash: "connected" });
    expect(h).toContain("1,200");
    expect(h).toContain("10 people a week");
    expect(h).toContain("Up from 1,000");
    expect(h).toContain("cafe newport");
    expect(h).not.toContain("—");
  });
  it("opens the print dialog for a PDF", () => {
    expect(
      renderReport(report, { token: "a".repeat(24), snapshot: null, flash: "print" }),
    ).toContain("print()");
  });
});

describe("score uses the whole area", async () => {
  const { areaPoints, scoreView } = await import("./report-page.server");
  it("works out area points", () => {
    // 6 in the top 3 and 10 at 4th to 10th: (6 + 4) / 25 x 25 = 10
    const ranks = [...Array(6).fill(1), ...Array(10).fill(5), ...Array(9).fill(null)];
    expect(areaPoints([{ ranks }])).toBe(10);
  });
  it("a phrase where you are nowhere pulls the score down and adds a fix", () => {
    const r = {
      ...report,
      score: 91,
      parts: [
        { label: "Star rating", got: 20, max: 25 },
        { label: "Position on Google Maps", got: 25, max: 25 },
      ],
      grids: [
        { keyword: "burger", ranks: Array(25).fill(1), top3: 25, found: 25, size: 5 },
        { keyword: "fast food", ranks: Array(25).fill(null), top3: 0, found: 0, size: 5 },
      ],
    };
    const v = scoreView(r);
    expect(v.score).toBeLessThan(91);
    expect(v.fixes.some((f) => f.title.includes("fast food"))).toBe(true);
    const h = renderReport(r, { token: "a".repeat(24), snapshot: null, flash: "" });
    expect(h).toContain("What we found");
    expect(h.indexOf("What we found")).toBeLessThan(h.indexOf("How we worked out your score"));
  });
});

describe("personal video at the top", () => {
  const base = { token: "a".repeat(24), snapshot: null, flash: "" };
  it("shows a Loom video first with Start free and the 3 steps", () => {
    const h = renderReport(report, {
      ...base,
      contactName: "Sam Jones",
      video: { kind: "loom", url: "https://www.loom.com/share/0123456789abcdef0123456789abcdef" },
    });
    expect(h).toContain("Sam, I recorded this for you");
    expect(h).toContain("https://www.loom.com/embed/0123456789abcdef0123456789abcdef");
    expect(h.indexOf("I recorded this")).toBeLessThan(h.indexOf("You and your nearest rivals"));
    expect(h).toContain("Type your email and a password");
    expect(h).toContain("Print your QR code");
    expect(h).toContain(`/start?r=${"a".repeat(24)}`);
    expect(h).toContain("https://wa.me/447512584332");
    expect(h).not.toContain("—");
  });
  it("uses the business name without a contact, and a plain video tag for files", () => {
    const h = renderReport(report, {
      ...base,
      video: { kind: "file", url: "https://x.supabase.co/storage/v1/object/public/v/a.mp4" },
    });
    expect(h).toContain("Test Cafe, I recorded this for you");
    expect(h).toContain('<video id="pv"');
    expect(h).toContain("playsinline");
  });
  it("has no video section without a video", () => {
    expect(renderReport(report, base)).not.toContain("I recorded this");
  });
  it("sets a personal link preview", () => {
    const h = renderReport(
      { ...report, fixes: [{ title: "No phone number", why: "", priority: "high" }] },
      { ...base, ogImage: "https://x.supabase.co/og/a.jpg" },
    );
    expect(h).toContain('og:title" content="Test Cafe, your Google report"');
    expect(h).toContain('og:description" content="No phone number"');
    expect(h).toContain('og:image" content="https://x.supabase.co/og/a.jpg"');
  });
});

describe("what 1 more customer is worth", () => {
  const base = { token: "a".repeat(24), snapshot: null, flash: "" };
  const wash: any = {
    ...report,
    business: {
      ...report.business,
      name: "Sparkle",
      address: "1 High St, Newport NP20 1AA, UK",
      category: "Car wash",
    },
    grids: [{ keyword: "car wash", ranks: Array(25).fill(null), top3: 4, found: 4, size: 5 }],
  };
  it("shows the default sum after the map, with the Growth price for the UK", () => {
    const h = renderReport(wash, base);
    expect(h).toContain("What 1 more customer is worth");
    expect(h).toContain("312</b> days a year");
    expect(h).toContain("£4,680");
    expect(h).toContain("RepSuites Growth is £49 a month (£588 a year).");
    expect(h).toContain('id="ws-range"');
    expect(h.indexOf("What 1 more customer is worth")).toBeGreaterThan(
      h.indexOf("Where you show up across your area"),
    );
    expect(h.indexOf("What 1 more customer is worth")).toBeLessThan(
      h.indexOf("You and your nearest rivals"),
    );
    expect(h).toContain(
      "Just <b>1 more customer a day</b> at £15 would add about <b>£4,680 a year</b>",
    );
    expect(h).not.toContain("—");
  });
  it("uses the saved value, per week, and shows static numbers when printing", () => {
    const h = renderReport(wash, {
      ...base,
      flash: "print",
      minSalePence: 15000,
      salePeriod: "week",
    });
    expect(h).toContain("£7,800");
    expect(h).toContain("52 weeks a year");
    expect(h).not.toContain('id="ws-range"');
  });
  it("leaves out the Growth price and the finding where they do not apply", () => {
    const ng: any = {
      ...wash,
      business: { ...wash.business, address: "12 Allen Ave, Ikeja, Lagos, Nigeria" },
      grids: [{ ...wash.grids[0], top3: 22 }],
    };
    const h = renderReport(ng, base);
    expect(h).toContain("₦5,000");
    expect(h).not.toContain("RepSuites Growth is");
    expect(h).not.toContain("would add about");
  });
});
