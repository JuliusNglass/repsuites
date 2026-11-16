import { describe, expect, it } from "vitest";
import { cleanSender, reviewSmsText, smsNumber, smsParts, smsPeriod } from "./review-sms";

describe("smsNumber", () => {
  it("accepts UK mobiles in any common form", () => {
    expect(smsNumber("07438 881617")).toBe("447438881617");
    expect(smsNumber("+44 7438 881617")).toBe("447438881617");
    expect(smsNumber("0044-7438-881617")).toBe("447438881617");
  });
  it("rejects landlines and junk", () => {
    expect(smsNumber("01633 123456")).toBeNull();
    expect(smsNumber("")).toBeNull();
    expect(smsNumber(null)).toBeNull();
  });
});

describe("cleanSender", () => {
  it("keeps a valid name and trims to 11", () => {
    expect(cleanSender("BrightClean")).toBe("BrightClean");
    expect(cleanSender("Bright & Clean Ltd")).toBe("Bright Clea");
  });
  it("rejects too short or starting with a digit", () => {
    expect(cleanSender("AB")).toBeNull();
    expect(cleanSender("123Clean")).toBeNull();
  });
});

describe("smsParts", () => {
  it("counts GSM parts", () => {
    expect(smsParts("a".repeat(160))).toBe(1);
    expect(smsParts("a".repeat(161))).toBe(2);
  });
  it("counts unicode parts", () => {
    expect(smsParts("😀".repeat(70))).toBe(1);
    expect(smsParts("😀".repeat(71))).toBe(2);
  });
});

describe("reviewSmsText", () => {
  it("adds the opt-out and plain punctuation", () => {
    const t = reviewSmsText("Hi Sam — thanks! ‘Review’ us: x", "https://l/u");
    expect(t).toBe("Hi Sam - thanks! 'Review' us: x\nOpt out: https://l/u");
  });
});

describe("smsPeriod", () => {
  it("uses UK months", () => {
    expect(smsPeriod(new Date("2026-11-30T23:30:00Z"))).toBe("2026-11");
    expect(smsPeriod(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07");
  });
});
