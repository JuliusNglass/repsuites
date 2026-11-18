import { describe, expect, it } from "vitest";
import {
  dueStep,
  followupMessage,
  inSendWindow,
  sendReminderDue,
  sendReminderSms,
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
  it("follow-ups are branded, short and STOP-free (the opt-out is in the first GHL text)", () => {
    for (const s of STEPS) {
      const m = followupMessage(base, s);
      const all = `${m.sms ?? ""}${m.html ?? ""}${m.text ?? ""}`;
      expect(all).not.toMatch(/—|money.back|Julius/i);
      if (m.sms) expect(m.sms.length).toBeLessThanOrEqual(200);
      if (m.sms && s.step === 1) expect(m.sms).toMatch(/Accelur8$/);
      if (m.sms) expect(m.sms).not.toContain("STOP");
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

describe("reply SEND reminders", () => {
  it("sends at 2h then 22h, never after 72h", () => {
    expect(sendReminderDue(base.createdAt, [], at(1))).toBeNull();
    expect(sendReminderDue(base.createdAt, [], at(3))).toBe(4);
    expect(sendReminderDue(base.createdAt, [4], at(10))).toBeNull();
    expect(sendReminderDue(base.createdAt, [4], at(23))).toBe(5);
    expect(sendReminderDue(base.createdAt, [4, 5], at(30))).toBeNull();
    expect(sendReminderDue(base.createdAt, [], at(80))).toBeNull();
  });
  it("is about them and has no opt-out line", () => {
    const m = sendReminderSms("dean osbourne", "Cambridge Storage", 4);
    expect(m).toContain("Hi Dean");
    expect(m).toContain("reply SEND".replace("reply", "Just reply"));
    expect(m).not.toMatch(/STOP/);
  });
});
