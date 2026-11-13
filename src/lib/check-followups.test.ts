import { describe, expect, it } from "vitest";
import {
  dueStep,
  followupMessage,
  inSendWindow,
  STEPS,
  type FollowupLead,
} from "./check-followups";

const base: FollowupLead = {
  id: "l1",
  name: "collins obinna",
  business: "Ben Basil Buff N Go",
  email: "a@b.co",
  phone: "+447000000000",
  createdAt: "2026-11-13T10:00:00Z",
  reportToken: "tok_abcdefghijklmnopqrst",
  keyword: "cleaning",
};
const at = (h: number) => new Date(new Date(base.createdAt).getTime() + h * 3_600_000);

describe("dueStep", () => {
  it("waits 20 hours for the first text", () => {
    expect(dueStep(base, [], at(19))).toBeNull();
    expect(dueStep(base, [], at(21))).toMatchObject({ step: 1, channel: "sms" });
  });
  it("goes in order and stops after step 3", () => {
    expect(dueStep(base, [1], at(73))).toMatchObject({ step: 2, channel: "email" });
    expect(dueStep(base, [1, 2], at(100))).toBeNull();
    expect(dueStep(base, [1, 2], at(169))).toMatchObject({ step: 3 });
    expect(dueStep(base, [1, 2, 3], at(400))).toBeNull();
  });
  it("swaps channel when one is missing", () => {
    expect(dueStep({ ...base, email: null }, [1], at(73))).toMatchObject({ channel: "sms" });
    expect(dueStep({ ...base, phone: null }, [], at(21))).toMatchObject({ channel: "email" });
  });
  it("needs a report and never starts an old lead", () => {
    expect(dueStep({ ...base, reportToken: null }, [], at(21))).toBeNull();
    expect(dueStep(base, [], at(24 * 11))).toBeNull();
    expect(STEPS).toHaveLength(3);
  });
});

describe("inSendWindow", () => {
  it("is daytime UK, not Sunday", () => {
    expect(inSendWindow(new Date("2026-11-13T10:00:00Z"))).toBe(true);
    expect(inSendWindow(new Date("2026-11-13T20:00:00Z"))).toBe(false);
    expect(inSendWindow(new Date("2026-11-15T12:00:00Z"))).toBe(false);
  });
});

describe("followupMessage", () => {
  it("is branded, has opt-out, no em dashes, no money-back line", () => {
    for (const s of STEPS) {
      const m = followupMessage(base, s);
      const all = `${m.sms ?? ""}${m.html ?? ""}${m.text ?? ""}`;
      expect(all).toContain("Accelur8");
      expect(all).not.toMatch(/—|money.back|Julius/i);
      if (m.sms) expect(m.sms).toContain("STOP");
    }
    expect(followupMessage(base, STEPS[0]!).sms).toContain("Hi Collins");
  });
  it("mentions SparkOps only for cleaning businesses", () => {
    expect(followupMessage(base, STEPS[1]!).html).toContain("SparkOps");
    expect(
      followupMessage({ ...base, keyword: "plumber", business: "Pipes Ltd" }, STEPS[1]!).html,
    ).not.toContain("SparkOps");
  });
});
