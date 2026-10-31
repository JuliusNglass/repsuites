/* eslint-disable @typescript-eslint/no-explicit-any -- test fixtures */
import { describe, expect, it } from "vitest";
import {
  asProduct,
  nicheQuery,
  OPS_DEFAULTS,
  opsCalc,
  reviewScanLine,
  scanReviews,
  siteSignals,
  sparkFinding,
  teamFromText,
  sparkMessage,
  sparkSubject,
} from "./sparkops";
import { opsStart, renderSparkReport, sparkBookingLink } from "./sparkops-report.server";

const plain = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&times;/g, "x")
    .replace(/&divide;/g, "/")
    .replace(/&minus;/g, "-")
    .replace(/&pound;/g, "£");

describe("where the hours go", () => {
  it("works the default sum step by step", () => {
    const c = opsCalc(OPS_DEFAULTS);
    expect(c.nowHours).toBe(6);
    expect(c.withHours).toBe(2.4);
    expect(c.savedWeek).toBe(3.6);
    expect(c.savedYear).toBe(187);
    expect(c.worth).toBe(2805);
    const lines = c.lines.map(plain);
    expect(lines[0]).toBe("60 cleans x 6 minutes = 360 minutes a week");
    expect(lines[1]).toBe("360 minutes / 60 = 6 hours of admin a week now");
    expect(lines[2]).toBe("With SparkOps, about 60% less: 6 x 0.4 = 2.4 hours a week");
    expect(lines[3]).toBe("6 - 2.4 = 3.6 hours saved every week");
    expect(lines[4]).toBe("3.6 x 52 weeks = 187 hours a year");
    expect(lines[5]).toBe("187 hours x £15 = £2,805 of your time a year");
    expect(plain(c.team)).toBe("5 cleaners doing 60 cleans is about 12 cleans each a week.");
  });
  it("uses the owner's numbers and keeps the sums adding up", () => {
    const c = opsCalc({ cleaners: 12, cleans: 150, minutes: 10, rate: 20 });
    // 150 x 10 = 1,500 minutes = 25 hours; 25 x 0.4 = 10; saved 15; 15 x 52 = 780; 780 x 20
    expect(c.nowHours).toBe(25);
    expect(c.withHours).toBe(10);
    expect(c.savedWeek).toBe(15);
    expect(c.savedYear).toBe(780);
    expect(c.worth).toBe(15600);
    expect(plain(c.lines[0]!)).toContain("1,500 minutes");
    expect(plain(c.total)).toBe("£15,600");
  });
  it("copes with odd input", () => {
    const c = opsCalc({ cleaners: 0, cleans: -5, minutes: NaN, rate: 15 });
    expect(c.worth).toBe(0);
    expect(plain(c.team)).toContain("1 cleaner doing");
  });
  it("runs the same in the page script as on the server", () => {
    const fn = new Function(`return (${opsCalc.toString()})`)() as typeof opsCalc;
    const i = { cleaners: 7, cleans: 85, minutes: 7, rate: 18 };
    expect(fn(i)).toEqual(opsCalc(i));
  });
});

describe("SparkOps outreach", () => {
  const link = "https://repsuites.com/r/abc";
  it("leads with the map, then the ops hook, link and rota question", () => {
    const t = sparkMessage(
      {
        name: "Sparkle Clean",
        contactName: "Sam Jones",
        hook: `For "cleaning company", you're in Google's top 3 in only 2 of the 25 spots I checked around you.`,
      },
      link,
    );
    expect(t.startsWith("Hi Sam, I'm Julius.")).toBe(true);
    expect(t).toContain("short report for Sparkle Clean");
    expect(t).toContain("only 2 of the 25 spots");
    expect(t).toContain("Most cleaning owners spend about 6 hours a week on rota and admin.");
    expect(t).toContain(link);
    expect(t.endsWith("How do you run your rota at the moment: WhatsApp, paper or an app?")).toBe(
      true,
    );
    expect(t).not.toContain("STOP");
    expect(t).not.toMatch(/—/);
  });
  it("falls back to the review gap, and the email has a STOP line", () => {
    const p = {
      name: "Sparkle Clean",
      gap: { leader: "Shine Co", leaderReviews: 120, reviews: 14 },
    };
    expect(sparkFinding(p)).toBe("Shine Co has 120 Google reviews. You have 14.");
    const e = sparkMessage(p, link, { email: true });
    expect(e.startsWith("Hi, I'm Julius.")).toBe(true);
    expect(e).toContain("Shine Co has 120 Google reviews");
    expect(e.endsWith("Reply STOP and I won't message again.")).toBe(true);
  });
  it("has no finding when there is nothing to say", () => {
    expect(sparkFinding({ name: "X" })).toBe("");
    expect(sparkMessage({ name: "X" }, link)).toContain("short report for X.\n\n");
  });
  it("says video when there is one", () => {
    const t = sparkMessage({ name: "X" }, link, { video: true });
    expect(t).toContain("recorded a quick video for X");
    expect(t).toContain("Watch it here:");
    expect(sparkSubject("X", true)).toBe("A quick video for X");
    expect(sparkSubject("X")).toBe("Where the hours go at X");
  });
  it("fills a niche into the search box, keeping the town", () => {
    expect(nicheQuery("office cleaning", "dentists in Newport")).toBe("office cleaning in Newport");
    expect(nicheQuery("window cleaning", "")).toBe("window cleaning in ");
    expect(asProduct("sparkops")).toBe("sparkops");
    expect(asProduct(null)).toBe("repsuites");
  });
});

describe("SparkOps report", () => {
  const report: any = {
    createdAt: "2026-10-30T12:00:00Z",
    business: {
      name: "Sparkle Clean",
      address: "1 High St, Newport NP20 1AA, UK",
      rating: 4.8,
      reviews: 14,
    },
    score: 60,
    parts: [],
    maps: { checked: true, keyword: "cleaning company", position: 7 },
    rivals: [{ name: "Shine Co", rating: 4.9, reviews: 120, km: 1.2 }],
    fixes: [],
    reviewGap: {
      leader: "Shine Co",
      leaderReviews: 120,
      need: 106,
      perWeekIn6Months: 5,
      perWeekIn12Months: 3,
    },
    grid: null,
  };
  const extra = { token: "a".repeat(24), snapshot: null, flash: "" };
  it("tells the SparkOps story in order, without RepSuites", () => {
    const h = renderSparkReport(report, extra);
    expect(h).toContain("SparkOps <small>by Accelur8</small>");
    expect(h).toContain(
      "SparkOps runs the day-to-day of a cleaning business: bookings, rotas, cleaners' app, checklists, invoices and reviews, in one place.",
    );
    const order = [
      "What we found",
      "Where the hours go",
      "Do any of these sound familiar?",
      "How SparkOps helps",
    ];
    const at = order.map((t) => h.indexOf(t));
    expect(at.every((x) => x > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(h).toContain("Shine Co");
    expect(h).toContain("Book a 15-minute demo");
    expect(h).toContain("Plans from £97 a month");
    expect(h).toContain("This is an estimate.");
    expect(h).not.toContain("RepSuites");
    expect(h).not.toContain("Start free");
    expect(h).not.toMatch(/—/);
  });
  it("leaves the price out outside the UK and shows a static sum when printing", () => {
    const h = renderSparkReport(
      { ...report, business: { ...report.business, address: "Lagos, Nigeria" } },
      { ...extra, flash: "print" },
    );
    expect(h).not.toContain("Plans from £97");
    expect(h).not.toContain('id="ops-cleans"');
    expect(h).toContain("print()");
  });
  it("books a demo on WhatsApp with the words ready", () => {
    expect(sparkBookingLink("Sparkle Clean")).toMatch(/^https:\/\/wa\.me\/447512584332\?text=/);
  });
});

describe("review pattern scan", () => {
  it("counts reviews that mention an ops problem, with a short quote", () => {
    const s = scanReviews([
      "Lovely team, house sparkling every week.",
      "The cleaner was late twice this month and nobody told us.",
      "They didn't turn up on Friday.",
      "Always on time, never late, never rushed.",
      "We had a no-show and had to rebook.",
    ]);
    expect(s.count).toBe(3);
    expect(s.total).toBe(5);
    expect(s.quote).toBe("The cleaner was late twice this month and nobody told us");
    expect(reviewScanLine(s)).toBe(
      "3 of the 5 newest reviews Google shows for you mention a late, missed or rushed clean.",
    );
  });
  it("matches whole words only, and says nothing with no match", () => {
    const s = scanReviews(["Chocolate on the plate, latest news, translated", "", null]);
    expect(s).toEqual({ count: 0, total: 1, quote: "" });
    expect(reviewScanLine(s)).toBe("");
    expect(reviewScanLine(null)).toBe("");
  });
  it("finds each kind of problem", () => {
    for (const t of [
      "a different cleaner every week",
      "the clean felt rushed",
      "they forgot the oven",
      "clean was cancelled last minute",
      "they missed our slot",
      "booked but did not turn up",
      "had a no show",
    ])
      expect(scanReviews([t]).count).toBe(1);
  });
  it("keeps the quote under 15 words", () => {
    const long =
      "We have used this company for three years and mostly it is fine but last week the cleaner was late again and the bathroom was not done properly at all";
    const q = scanReviews([long]).quote;
    expect(
      q
        .replace(/\.\.\./g, " ")
        .split(/\s+/)
        .filter(Boolean).length,
    ).toBeLessThan(15);
    expect(q).toContain("late");
  });
  it("one in the opener with the quote", () => {
    const t = sparkMessage(
      { name: "X", scan: { count: 1, total: 5, quote: "they forgot the oven" } },
      "https://repsuites.com/r/abc",
    );
    expect(t).toContain(
      '1 of the 5 newest reviews Google shows for you mentions a late, missed or rushed clean. One says: "they forgot the oven"',
    );
  });
});

describe("website signals", () => {
  const url = "https://shine.example.co.uk/";
  it("spots booking tools and date forms", () => {
    expect(siteSignals('<iframe src="https://calendly.com/shine"></iframe>', url).booking).toBe(
      true,
    );
    expect(
      siteSignals('<script src="https://x.bookingkoala.com/w.js"></script>', url).booking,
    ).toBe(true);
    expect(siteSignals('<form><input type="date" name="d"></form>', url).booking).toBe(true);
    const plain = siteSignals('<a href="/contact">Contact us</a>', url);
    expect(plain.booking).toBe(false);
    expect(plain.bookLink).toBe("");
  });
  it("finds a Book now link to check next", () => {
    expect(siteSignals('<a href="/book-now">Book now</a>', url).bookLink).toBe(
      "https://shine.example.co.uk/book-now",
    );
  });
  it("spots hiring and team size", () => {
    const s = siteSignals("<p>We're hiring! Join our team of 14 fully insured cleaners.</p>", url);
    expect(s.hiring).toBe(true);
    expect(s.team).toBe(14);
    expect(teamFromText("our twelve friendly cleaners")).toBe(12);
    expect(teamFromText("1 cleaner")).toBeNull();
    expect(teamFromText("call 07700 900123 staff")).toBeNull();
  });
  it("prefills the calculator from a team size", () => {
    const base: any = { ops: { team: 8, teamFrom: "website" } };
    expect(opsStart(base)).toMatchObject({ cleaners: 8, cleans: 95, from: "website" });
    expect(opsStart({} as any)).toMatchObject({ cleaners: 5, cleans: 60, from: null });
  });
});
