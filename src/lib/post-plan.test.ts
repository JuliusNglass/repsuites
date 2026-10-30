import { describe, expect, it } from "vitest";
import { londonTime, parsePlan, planDates, seasonNotes, tidyPost } from "./post-plan";

describe("planDates", () => {
  it("gives 4 Tuesdays at 11am London time, a week apart", () => {
    // Friday 30 October 2026, 5pm UK (GMT after the clocks go back).
    const d = planDates(new Date("2026-10-30T17:00:00Z"));
    expect(d).toEqual([
      "2026-11-03T11:00:00.000Z",
      "2026-11-10T11:00:00.000Z",
      "2026-11-17T11:00:00.000Z",
      "2026-11-24T11:00:00.000Z",
    ]);
  });
  it("uses summer time (11am BST is 10am UTC)", () => {
    expect(londonTime(2026, 6, 7, 11).toISOString()).toBe("2026-07-07T10:00:00.000Z");
  });
  it("skips a Tuesday less than a day away", () => {
    // Tuesday 3 November 2026, 9am: today's 11am is too soon.
    expect(planDates(new Date("2026-11-03T09:00:00Z"))[0]).toBe("2026-11-10T11:00:00.000Z");
  });
});

describe("parsePlan", () => {
  it("reads the plan and tidies each post", () => {
    const p = parsePlan(
      'Here you go {"posts":[{"text":"Bonfire Night is coming — warm up with our burgers. Call 07123 456789 today. 🎆🍔🔥 Lovely food, said Sai.","button":"order"},{"text":"too short","button":null}]}',
    );
    expect(p).toHaveLength(1);
    expect(p[0]!.button).toBe("ORDER");
    expect(p[0]!.text).not.toContain("—");
    expect(p[0]!.text).not.toContain("07123");
    expect([...p[0]!.text.matchAll(/\p{Extended_Pictographic}/gu)]).toHaveLength(1);
  });
  it("returns nothing for junk", () => {
    expect(parsePlan("no json")).toEqual([]);
    expect(parsePlan('{"posts": "x"}')).toEqual([]);
  });
  it("keeps posts a sensible length", () => {
    expect(tidyPost("Word. ".repeat(300)).length).toBeLessThanOrEqual(750);
  });
});

describe("seasonNotes", () => {
  it("mentions Bonfire Night at the end of October", () => {
    expect(seasonNotes(new Date("2026-10-30T12:00:00Z")).join(" ")).toContain("Bonfire Night");
  });
});

describe("post pictures", async () => {
  const { choosePhotos, trimQuote, pickQuote } = await import("./post-plan");
  const photo = (cat: string, at: string, url: string, w = 1200) => ({
    mediaFormat: "PHOTO",
    googleUrl: url,
    thumbnailUrl: `${url}=s200`,
    createTime: at,
    dimensions: { widthPixels: w, heightPixels: w },
    locationAssociation: { category: cat },
  });
  it("prefers food and work photos, newest first, and skips logos and tiny ones", () => {
    const out = choosePhotos([
      photo("LOGO", "2026-10-01T00:00:00Z", "https://g/logo"),
      photo("INTERIOR", "2026-10-02T00:00:00Z", "https://g/inside"),
      photo("FOOD_AND_DRINK", "2026-09-01T00:00:00Z", "https://g/old-food"),
      photo("FOOD_AND_DRINK", "2026-10-03T00:00:00Z", "https://g/new-food"),
      photo("FOOD_AND_DRINK", "2026-10-04T00:00:00Z", "https://g/tiny", 100),
      { mediaFormat: "VIDEO", googleUrl: "https://g/video" },
    ]);
    expect(out.map((p) => p.url)).toEqual([
      "https://g/new-food",
      "https://g/old-food",
      "https://g/inside",
    ]);
    expect(choosePhotos(undefined)).toEqual([]);
  });
  it("trims long quotes at a word", () => {
    expect(trimQuote("short and sweet")).toBe("short and sweet");
    const t = trimQuote("word ".repeat(60), 50);
    expect(t.endsWith("...")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(53);
  });
  it("uses the phrase the post quotes, with the reviewer's name", () => {
    const reviews = [
      { first: "Ceri", comment: "Excellent value for money, will be back" },
      { first: "Mike", comment: "The food is brilliantly priced and tasty." },
    ];
    expect(pickQuote('Mike thinks the food is "brilliantly priced".', reviews)).toEqual({
      quote: "brilliantly priced",
      by: "Mike",
    });
    expect(pickQuote("No quotes here.", reviews)?.by).toBe("Ceri");
    expect(pickQuote("No quotes here.", reviews, new Set([reviews[0]!.comment]))?.by).toBe("Mike");
    expect(pickQuote("Nothing", [])).toBeNull();
  });
});
