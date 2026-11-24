import { describe, expect, it } from "vitest";
import { bookLink, chaseDue, chaseSms, offerFor, salesLink } from "./growth-chase";

const created = "2026-11-22T10:00:00Z";
const at = (min: number) => new Date(new Date(created).getTime() + min * 60_000);

describe("chaseDue", () => {
  it("texts at 3 min, next day and day 3, in order", () => {
    expect(chaseDue(created, [], at(2))).toBeNull();
    expect(chaseDue(created, [], at(4))).toBe(1);
    expect(chaseDue(created, [1], at(60))).toBeNull();
    expect(chaseDue(created, [1], at(8 * 60 + 1))).toBe(2);
    expect(chaseDue(created, [1, 2], at(44 * 60 + 1))).toBe(3);
    expect(chaseDue(created, [1, 2, 3], at(80 * 60))).toBeNull();
  });
  it("ignores old leads and leads from before launch", () => {
    expect(chaseDue(created, [], at(97 * 60))).toBeNull();
    expect(chaseDue("2026-11-20T16:44:00Z", [], new Date("2026-11-21T09:00:00Z"))).toBeNull();
  });
});

describe("chaseSms", () => {
  it("is short, about them, branded and STOP-free", () => {
    const link = bookLink({ firstName: "daniel", email: "a@b.co", phone: "+447000000000" });
    expect(link).toContain("growth.accelur8clientwork.com/book?first_name=daniel");
    for (const s of [1, 2, 3] as const) {
      const m = chaseSms(s, "daniel", link);
      expect(m.startsWith("Hi Daniel")).toBe(true);
      expect(m).toMatch(/Accelur8$/);
      expect(m).not.toMatch(/STOP|Julius|—/);
    }
  });
});

describe("sales page first", () => {
  it("picks the page from their answers and never sends a bare booking link", () => {
    expect(offerFor(["lead-commercial"])).toBe("commercial");
    expect(offerFor(["lead-hiring"])).toBe("hiring");
    expect(offerFor(["lead-rebook"])).toBe("reactivation");
    const l = salesLink("commercial", { firstName: "Victor" });
    expect(l).toBe("https://growth.accelur8clientwork.com/commercial?first_name=Victor");
    for (const s of [1, 2, 3] as const) expect(chaseSms(s, "victor", l)).not.toContain("/book");
  });
});

describe("free check route for unqualified leads", () => {
  it("routes nurture/solo but not qualified", async () => {
    const { isCheckRoute } = await import("./growth-chase");
    expect(isCheckRoute(["grw-lead", "nurture"])).toBe(true);
    expect(isCheckRoute(["grw-lead", "solo"])).toBe(true);
    expect(isCheckRoute(["grw-lead", "qualified"])).toBe(false);
    expect(isCheckRoute(["grw-lead", "qualified", "nurture"])).toBe(false);
  });
  it("no text has an opt-out line, all point at the £1 trial", async () => {
    const { checkSms, CHECK_LINK } = await import("./growth-chase");
    expect(checkSms(1, "dee", "Complete cleaning")).not.toContain("STOP");
    expect(checkSms(1, "dee", "Complete cleaning")).toContain("repsuites.com/try");
    expect(checkSms(2, "dee", null)).not.toContain("STOP");
    expect(checkSms(3, "dee", null)).toContain(CHECK_LINK);
  });
});

describe("chase timing", () => {
  it("sends the first text at any hour and later ones 8am to 9pm", async () => {
    const { chaseWindowOk, chaseDue } = await import("./growth-chase");
    const sunday1am = new Date("2026-11-22T01:00:00Z");
    expect(chaseWindowOk(1, sunday1am)).toBe(true);
    expect(chaseWindowOk(2, sunday1am)).toBe(false);
    expect(chaseWindowOk(2, new Date("2026-11-23T07:30:00Z"))).toBe(true);
    expect(chaseWindowOk(2, new Date("2026-11-23T09:29:00Z"))).toBe(true);
    expect(chaseWindowOk(2, new Date("2026-11-23T07:29:00Z"))).toBe(false);
    expect(chaseWindowOk(2, new Date("2026-11-23T09:30:00Z"))).toBe(false);
    expect(chaseWindowOk(3, new Date("2026-11-22T10:00:00Z"))).toBe(false);
    expect(chaseDue("2026-11-22T00:55:00Z", [], sunday1am)).toBe(1);
  });
  it("solo grow texts have the link and no opt-out", async () => {
    const { growSms } = await import("./growth-chase");
    for (const s of [1, 2, 3] as const) {
      const t = growSms(s, "Laura", "https://x.test/a");
      expect(t).toContain("https://x.test/a");
      expect(t).not.toMatch(/STOP|—/);
    }
  });
});

describe("later leads", () => {
  it("get the Why wait video after the first text", async () => {
    const { isLater, laterSms, whyLink } = await import("./growth-chase");
    expect(isLater(["qualified", "nurture"])).toBe(true);
    expect(isLater(["qualified"])).toBe(false);
    const link = whyLink({ firstName: "Ross", email: "r@x.test" });
    expect(link).toContain("/why?");
    expect(laterSms(2, "Ross", link)).toContain(link);
    expect(laterSms(3, "Ross", link)).not.toMatch(/STOP|—/);
  });
});

describe("approved first texts", () => {
  it("new lead text names the business, has the link and an email option", async () => {
    const { firstSms, welcomeSms } = await import("./growth-chase");
    const t = firstSms("Laura", "Tidy Towns", "https://x.test/v");
    expect(t).toContain("Tidy Towns");
    expect(t).toContain("https://x.test/v");
    expect(t).toContain("reply EMAIL");
    const w = welcomeSms("Henry", null);
    expect(w).not.toMatch(/https?:|£1|STOP/);
  });
});

import { watchedVideo, watchedSms } from "./growth-chase";
describe("watched video follow-ups", () => {
  it("counts 75% or more as watched", () => {
    expect(watchedVideo(["vsl-100"])).toBe(true);
    expect(watchedVideo(["vsl-75"])).toBe(true);
    expect(watchedVideo(["vsl-50"])).toBe(false);
    expect(watchedVideo(["vsl-none"])).toBe(false);
  });
  it("sends them to booking, not 'did you watch'", () => {
    const m = watchedSms(2, "Joanna", "https://x.test/book");
    expect(m).toContain("glad you watched");
    expect(m).toContain("https://x.test/book");
    expect(m).not.toMatch(/did you get a chance/i);
    expect(m).not.toContain("—");
    expect(watchedSms(3, "Joanna", "https://x.test/book")).toContain("last nudge");
  });
});

describe("funnel v4 texts", () => {
  it("ready leads get their booking link, never a video nudge", async () => {
    const { readySms, isFunnelV4 } = await import("./growth-chase");
    expect(isFunnelV4(["grw-lead", "funnel-v4"])).toBe(true);
    for (const step of [1, 2, 3] as const) {
      const t = readySms(
        step,
        "kelechi",
        "Adkleen Ltd",
        "https://growth.accelur8clientwork.com/book?x=1",
      );
      expect(t).toContain("https://growth.accelur8clientwork.com/book?x=1");
      expect(t).toMatch(/^Hi Kelechi,/);
      expect(t).toMatch(/Accelur8$/);
      expect(t).not.toMatch(/video|STOP|opt out|—|Julius/i);
    }
    expect(readySms(1, "a", "Adkleen Ltd", "https://x")).toContain("Adkleen Ltd");
  });
  it("later leads get the Why wait page", async () => {
    const { laterFirstSms } = await import("./growth-chase");
    const t = laterFirstSms("ann", null, "https://growth.accelur8clientwork.com/why?a=1");
    expect(t).toContain("your business");
    expect(t).toContain("https://growth.accelur8clientwork.com/why?a=1");
    expect(t).not.toMatch(/STOP|—/);
  });
});
