import { describe, expect, it } from "vitest";
import {
  a4Sheet,
  A4,
  BLEED_MM,
  canvasSize,
  defaultFormat,
  defaultMessage,
  FORMAT_GROUPS,
  FORMATS,
  isDigital,
  MESSAGES,
  messageOrder,
  sheetText,
  sizeText,
  type PrintFormat,
} from "./print-design";
import { businessKind, tenantKind } from "./business-type";
import { googleLinkPlan, primaryCategory } from "./google-link";

const px = (mm: number) => Math.round((mm * 300) / 25.4);

describe("print formats", () => {
  it("has the service-business sizes", () => {
    expect(FORMATS.card).toMatchObject({ wMm: 85, hMm: 55, round: false, group: "job" });
    expect(FORMATS.a6).toMatchObject({ wMm: 105, hMm: 148, group: "job" });
    expect(FORMATS.sticker).toMatchObject({ wMm: 50, hMm: 50, round: true, group: "job" });
    expect(FORMATS.email.px).toEqual({ w: 600, h: 200 });
  });
  it("draws print formats at 300 dpi with a 3 mm bleed", () => {
    expect(canvasSize("card")).toEqual({ w: px(85 + 2 * BLEED_MM), h: px(55 + 2 * BLEED_MM) });
    expect(canvasSize("a6")).toEqual({ w: px(111), h: px(154) });
    expect(canvasSize("sticker")).toEqual({ w: px(56), h: px(56) });
    expect(canvasSize("card").w).toBeGreaterThan(canvasSize("card").h);
  });
  it("draws the online picture at its exact pixel size", () => {
    expect(canvasSize("email")).toEqual({ w: 600, h: 200 });
    expect(isDigital("email")).toBe(true);
    expect(isDigital("card")).toBe(false);
  });
  it("puts every format in a group, with a best-for line", () => {
    const groups = new Set(FORMAT_GROUPS.map((g) => g.id));
    for (const f of Object.keys(FORMATS) as PrintFormat[]) {
      expect(groups.has(FORMATS[f].group)).toBe(true);
      expect(FORMATS[f].bestFor.length).toBeGreaterThan(5);
    }
  });
  it("says the size in plain words", () => {
    expect(sizeText("card")).toBe("85 x 55 mm");
    expect(sizeText("sticker")).toMatch(/50 mm round/);
    expect(sizeText("email")).toBe("600 x 200 pixels");
  });
  it("has no em dashes in any copy", () => {
    const all = JSON.stringify([FORMATS, FORMAT_GROUPS, MESSAGES]);
    expect(all).not.toContain("—");
  });
});

describe("defaults by business type", () => {
  it("starts restaurants on the table stand and visit words", () => {
    expect(defaultFormat(true)).toBe("a5");
    expect(MESSAGES[defaultMessage(true)]!.fits).toBe("visit");
  });
  it("starts service businesses on the business card and job words", () => {
    expect(defaultFormat(false)).toBe("card");
    expect(MESSAGES[defaultMessage(false)]!.headline).toBe("How did we do on your job?");
  });
  it("offers every message, best fits first", () => {
    const o = messageOrder(false);
    expect([...o].sort((a, b) => a - b)).toEqual(MESSAGES.map((_, i) => i));
    expect(MESSAGES[o[o.length - 1]!]!.fits).toBe("visit");
  });
});

describe("business type", () => {
  it("trusts the Google category", () => {
    expect(businessKind({ category: "Italian restaurant", name: "Accelur8" })).toBe("hospitality");
    expect(businessKind({ category: "Marketing consultant", name: "Pizza Express" })).toBe(
      "service",
    );
    expect(businessKind({ types: ["gcid:coffee_shop"] })).toBe("hospitality");
    expect(businessKind({ types: ["meal_takeaway"] })).toBe("hospitality");
    expect(businessKind({ types: ["gcid:house_cleaning_service"] })).toBe("service");
  });
  it("falls back to the name", () => {
    expect(businessKind({ name: "Burger Base" })).toBe("hospitality");
    expect(businessKind({ name: "Amity Hotel" })).toBe("hospitality");
    expect(businessKind({ name: "TEN Bar & Kitchen" })).toBe("hospitality");
    expect(businessKind({ name: "Accelur8 Ltd" })).toBe("service");
    expect(businessKind({ name: "Home Again Cleaning Services" })).toBe("service");
    expect(businessKind({ name: "Smith Kitchen Fitters" })).toBe("service");
    expect(businessKind({ name: "Barber Shop" })).toBe("service");
    expect(businessKind({ name: "" })).toBe("service");
  });
  it("reads the tenant settings", () => {
    expect(tenantKind({ name: "The Ivy", settings: { google_category: "Restaurant" } })).toBe(
      "hospitality",
    );
    expect(tenantKind({ name: "Cafe Accelur8", settings: { google_category: "Consultant" } })).toBe(
      "service",
    );
    // An empty category (Google gave none) falls back to the name.
    expect(tenantKind({ name: "Cosy Cafe", settings: { google_category: "" } })).toBe(
      "hospitality",
    );
    expect(tenantKind({ name: "Accelur8 Ltd", settings: null })).toBe("service");
  });
});

describe("linking QR codes to Google", () => {
  const codes = [
    { id: "a", target_url: null },
    { id: "b", target_url: "https://example.com/already" },
  ];
  it("fills only codes with no target and adds a Google link when missing", () => {
    const p = googleLinkPlan({
      placeId: "ChIJ8zOhWZ0ddkgR6nfs8oVWbvY",
      codes,
      hasGoogleReviewLink: false,
    });
    expect(p.codeIds).toEqual(["a"]);
    expect(p.target).toBe(
      "https://search.google.com/local/writereview?placeid=ChIJ8zOhWZ0ddkgR6nfs8oVWbvY",
    );
    expect(p.addReviewLink).toBe(true);
  });
  it("leaves an existing Google link alone", () => {
    const p = googleLinkPlan({
      placeId: "ChIJ8zOhWZ0ddkgR6nfs8oVWbvY",
      codes,
      hasGoogleReviewLink: true,
    });
    expect(p.addReviewLink).toBe(false);
  });
  it("does nothing without a good place ID", () => {
    for (const placeId of [null, "", "bad id!"]) {
      const p = googleLinkPlan({ placeId, codes, hasGoogleReviewLink: false });
      expect(p).toEqual({ codeIds: [], placeId: null, target: null, addReviewLink: false });
    }
  });
  it("reads the primary category", () => {
    expect(
      primaryCategory({
        categories: {
          primaryCategory: {
            name: "categories/gcid:marketing_consultant",
            displayName: "Marketing consultant",
          },
        },
      }),
    ).toEqual({ name: "Marketing consultant", id: "gcid:marketing_consultant" });
    expect(primaryCategory({})).toBeNull();
    expect(primaryCategory(null)).toBeNull();
  });
});

describe("A4 sheet to print at home", () => {
  const inside = (l: ReturnType<typeof a4Sheet>) => {
    const pw = l.landscape ? A4.h : A4.w;
    const ph = l.landscape ? A4.w : A4.h;
    return l.slots.every(
      (s) => s.x >= -0.001 && s.y >= -0.001 && s.x + s.w <= pw + 0.001 && s.y + s.h <= ph + 0.001,
    );
  };
  const overlap = (l: ReturnType<typeof a4Sheet>) =>
    l.slots.some((a, i) =>
      l.slots.some(
        (b, j) => i < j && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
      ),
    );

  it("fits 9 business cards with margins, turned to fit more", () => {
    const l = a4Sheet(85, 55);
    expect(l.count).toBe(9);
    expect(l.rotated).toBe(true);
    expect(l.tight).toBe(false);
    expect(l.slots[0]!.x).toBeGreaterThanOrEqual(6);
  });
  it("fits 4 square cards and 4 coasters", () => {
    expect(a4Sheet(95, 95).count).toBe(4);
    expect(sheetText("coaster")).toBe("4 coasters");
  });
  it("fits 2 A5 stands edge to edge on a sideways sheet", () => {
    const l = a4Sheet(148, 210);
    expect(l.count).toBe(2);
    expect(l.tight).toBe(true);
  });
  it("fits 2 A6 cards with margins", () => {
    const l = a4Sheet(105, 148);
    expect(l.count).toBe(2);
    expect(l.tight).toBe(false);
  });
  it("keeps every piece on the page and apart", () => {
    for (const f of Object.keys(FORMATS) as PrintFormat[]) {
      if (isDigital(f)) continue;
      const l = a4Sheet(FORMATS[f].wMm, FORMATS[f].hMm);
      expect(l.count).toBeGreaterThan(0);
      expect(l.slots).toHaveLength(l.count);
      expect(inside(l)).toBe(true);
      expect(overlap(l)).toBe(false);
    }
  });
  it("says what is on the sheet in plain words", () => {
    expect(sheetText("card")).toBe("9 business cards");
    expect(sheetText("a5")).toBe("2 table stands");
    expect(sheetText("email")).toBe("");
  });
});
