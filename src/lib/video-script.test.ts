import { describe, expect, it } from "vitest";
import { cleanScript, reminderDue, reminderSms, scriptEmail, scriptReadySms } from "./video-script";

const script = {
  title: "Never miss a clean",
  scenes: [1, 2, 3, 4].map((n) => ({
    line: `Line ${n}.`,
    picture: `Picture ${n}`,
    words: n === 1 ? "Hello" : "",
  })),
};

describe("video scripts", () => {
  it("chases on day 2, 4 and 6, once each", () => {
    const sent = "2026-11-01T10:00:00Z";
    expect(reminderDue(sent, 0, new Date("2026-11-02T10:00:00Z"))).toBeNull();
    expect(reminderDue(sent, 0, new Date("2026-11-03T10:00:00Z"))).toBe(1);
    expect(reminderDue(sent, 1, new Date("2026-11-03T11:00:00Z"))).toBeNull();
    expect(reminderDue(sent, 1, new Date("2026-11-05T10:00:00Z"))).toBe(2);
    expect(reminderDue(sent, 2, new Date("2026-11-07T10:00:00Z"))).toBe(3);
    expect(reminderDue(sent, 3, new Date("2026-11-20T10:00:00Z"))).toBeNull();
    expect(reminderDue(null, 0, new Date())).toBeNull();
  });

  it("customer copy is signed Accelur8 with no opt-out, names or em dashes", () => {
    const msgs = [
      scriptReadySms("Sam Jones", "t".repeat(40), 0),
      scriptReadySms("Sam", "t".repeat(40), 1),
      reminderSms("Sam", "t".repeat(40)),
      scriptEmail("Sam", "Shine Co", script, "t".repeat(40)).text,
      scriptEmail("Sam", "Shine Co", script, "t".repeat(40), { reminder: true }).html,
    ];
    for (const m of msgs) {
      expect(m).toContain("Accelur8");
      expect(m).not.toMatch(/STOP|opt out|Julius|—/);
    }
    expect(msgs[0]).toContain("Hi Sam,");
  });

  it("escapes client text in the email", () => {
    const e = scriptEmail("<b>", "X", { ...script, title: "<script>" }, "t".repeat(40));
    expect(e.html).not.toContain("<script>");
  });

  it("cleans AI output and rejects thin scripts", () => {
    const c = cleanScript({ title: "A — B", scenes: script.scenes });
    expect(c?.title).toBe("A - B");
    expect(cleanScript({ title: "x", scenes: script.scenes.slice(0, 2) })).toBeNull();
    expect(cleanScript(null)).toBeNull();
  });
});
