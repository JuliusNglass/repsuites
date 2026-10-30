import { describe, expect, it } from "vitest";
import { insightFacts, parseInsightSummary } from "./insights";

const now = new Date("2026-10-30T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

describe("insightFacts", () => {
  it("compares the last 90 days with the 90 before", () => {
    const f = insightFacts(
      [
        { stars: 5, comment: "Great", at: daysAgo(5), replied: true },
        { stars: 4, comment: "", at: daysAgo(40), replied: false },
        { stars: 3, comment: "Late", at: daysAgo(120), replied: true },
        { stars: 5, comment: "old", at: daysAgo(400), replied: true },
      ],
      [{ message: "Missed the oven", at: daysAgo(10) }],
      now,
    );
    expect(f.reviews).toBe(2);
    expect(f.reviewsBefore).toBe(1);
    expect(f.avg).toBe(4.5); // (5 + 4) / 2
    expect(f.avgBefore).toBe(3);
    expect(f.replyRate).toBe(50); // 1 of 2 answered
    expect(f.privateMessages).toBe(1);
    expect(f.withText).toBe(2); // "Great" + the message
  });
});

describe("parseInsightSummary", () => {
  it("reads fenced JSON, caps lists and strips long dashes", () => {
    const s = parseInsightSummary(
      '```json\n{"headline":"Customers love the team — mostly","praises":[{"theme":"Friendly","mentions":4,"quote":"so kind"},{"theme":"a"},{"theme":"b"},{"theme":"c"}],"complaints":[],"people":[{"name":"Tegan","mentions":2,"tone":"positive"}],"trend":"Up","action":{"title":"Ask every customer","why":"More reviews"}}\n```',
    );
    expect(s?.headline).toBe("Customers love the team - mostly");
    expect(s?.praises).toHaveLength(3);
    expect(s?.people[0]?.name).toBe("Tegan");
  });
  it("rejects answers without a headline or action", () => {
    expect(parseInsightSummary('{"headline":"x"}')).toBeNull();
    expect(parseInsightSummary("no json")).toBeNull();
  });
});
