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
