import { describe, expect, it } from "vitest";
import {
  afterSend,
  askedRecently,
  fillMessage,
  inQuietHours,
  intlDigits,
  last30Counts,
  outOfQuietHours,
  parseLine,
  parseTriggerPayload,
  reminderDecision,
  requestChips,
  reviewerMatches,
  triggeredSendTime,
  whatsappLink,
} from "./review-requests";

describe("phone numbers", () => {
  it("turns local numbers into international ones", () => {
    expect(intlDigits("07700 900123", "44")).toBe("447700900123");
    expect(intlDigits("0803 123 4567", "234")).toBe("2348031234567");
    expect(intlDigits("+234 803 123 4567", "44")).toBe("2348031234567");
    expect(intlDigits("00447700900123", "234")).toBe("447700900123");
    expect(intlDigits("abc", "44")).toBeNull();
  });
  it("builds a WhatsApp link with the message", () => {
    expect(whatsappLink("07700900123", "44", "Hi Jo")).toBe(
      "https://wa.me/447700900123?text=Hi%20Jo",
    );
  });
});

describe("messages", () => {
  it("uses the first name and falls back politely", () => {
    const v = { business: "Burger Base", link: "https://x/q/a" };
    expect(fillMessage("Hi {name}, {business}: {link}", { ...v, name: "Jane Smith" })).toBe(
      "Hi Jane, Burger Base: https://x/q/a",
    );
    expect(fillMessage("Hi {name}, thanks", { ...v, name: "" })).toBe("Hi, thanks");
  });
});

describe("afterSend", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  it("times reminders from the first ask (day 3, then day 7), then finishes", () => {
    const a = afterSend(0, 2, [3, 7], now, now);
    expect(a.status).toBe("waiting");
    expect(a.dueAt).toBe("2026-11-02T12:00:00.000Z");
    const later = new Date("2026-11-02T12:00:00Z");
    const b = afterSend(1, 2, [3, 7], now, later);
    expect(b.step).toBe(2);
    expect(b.dueAt).toBe("2026-11-06T12:00:00.000Z");
    expect(afterSend(2, 2, [3, 7], now, later).status).toBe("finished");
    expect(afterSend(1, 1, [3, 7], now, later).status).toBe("finished");
    expect(afterSend(0, 0, [3, 7], now, now).status).toBe("finished");
  });
});

describe("reminderDecision", () => {
  const first = new Date("2026-10-30T12:00:00Z");
  const now = new Date("2026-11-02T12:00:00Z");
  it("always sends the first ask", () => {
    expect(reminderDecision({ step: 0 }, 2, [3, 7], null, now).action).toBe("send");
  });
  it("stops on strong signals", () => {
    for (const k of ["clickedAt", "feedbackAt", "reviewedAt", "unsubscribedAt"])
      expect(reminderDecision({ step: 1, [k]: now.toISOString() }, 2, [3, 7], first, now)).toEqual({
        action: "finish",
      });
  });
  it("treats opened as soft: skip to the last reminder", () => {
    expect(
      reminderDecision({ step: 1, openedAt: now.toISOString() }, 2, [3, 7], first, now),
    ).toEqual({ action: "later", step: 2, dueAt: "2026-11-06T12:00:00.000Z" });
    // Last reminder still goes if they only opened.
    expect(
      reminderDecision({ step: 2, openedAt: now.toISOString() }, 2, [3, 7], first, now).action,
    ).toBe("send");
    expect(
      reminderDecision({ step: 1, openedAt: now.toISOString() }, 1, [3, 7], first, now).action,
    ).toBe("send");
  });
});

describe("cooldown", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const past = [
    {
      email: "jane@x.com",
      phone_key: null,
      status: "finished",
      created_at: "2026-09-15T00:00:00Z",
    },
    {
      email: null,
      phone_key: "447700900123",
      status: "waiting",
      created_at: "2026-06-01T00:00:00Z",
    },
    { email: "skip@x.com", phone_key: null, status: "skipped", created_at: "2026-10-30T00:00:00Z" },
  ];
  it("matches on email within the window", () => {
    expect(askedRecently({ email: "jane@x.com", phoneKey: null }, past, 90, now)).toBe(true);
    expect(askedRecently({ email: "jane@x.com", phoneKey: null }, past, 30, now)).toBe(false);
  });
  it("matches on phone", () => {
    expect(askedRecently({ email: null, phoneKey: "447700900123" }, past, 180, now)).toBe(true);
    expect(askedRecently({ email: null, phoneKey: "447700900123" }, past, 90, now)).toBe(false);
  });
  it("ignores skipped rows", () => {
    expect(askedRecently({ email: "skip@x.com", phoneKey: null }, past, 90, now)).toBe(false);
  });
});

describe("reviewerMatches", () => {
  it("needs first and last name to match, loosely", () => {
    expect(reviewerMatches("Jane Smith", "Jane Smith")).toBe(true);
    expect(reviewerMatches("Jane Smith", "jane smith")).toBe(true);
    expect(reviewerMatches("Jane Smith", "Jane S.")).toBe(true);
    expect(reviewerMatches("Jayne Smith", "Jane Smith")).toBe(true);
    expect(reviewerMatches("Jon Adeyemi", "Jonathan Adeyemi")).toBe(true);
    expect(reviewerMatches("Chloé Dupont", "Chloe Dupont")).toBe(true);
    expect(reviewerMatches("Jane Smith", "Jane Brown")).toBe(false);
    expect(reviewerMatches("Jane Smith", "Tom Smith")).toBe(false);
    expect(reviewerMatches("Jane", "Jane Smith")).toBe(false);
    expect(reviewerMatches("Jane Smith", "Jane")).toBe(false);
  });
});

describe("quiet hours and scheduling", () => {
  it("handles windows across midnight", () => {
    expect(inQuietHours(21, 20, 9)).toBe(true);
    expect(inQuietHours(3, 20, 9)).toBe(true);
    expect(inQuietHours(9, 20, 9)).toBe(false);
    expect(inQuietHours(12, 12, 12)).toBe(false);
  });
  it("sends 2 hours after the trigger in the daytime", () => {
    const t = new Date("2026-07-10T10:00:00Z"); // 11am London (BST)
    expect(triggeredSendTime(t, 2, "Europe/London").toISOString()).toBe("2026-07-10T12:00:00.000Z");
  });
  it("moves evening triggers to 9am the next day, business time", () => {
    const t = new Date("2026-07-10T18:30:00Z"); // 7:30pm BST, +2h = 9:30pm
    expect(triggeredSendTime(t, 2, "Europe/London").toISOString()).toBe("2026-07-11T08:00:00.000Z");
    const winter = new Date("2026-12-10T19:00:00Z"); // 7pm GMT
    expect(triggeredSendTime(winter, 2, "Europe/London").toISOString()).toBe(
      "2026-12-11T09:00:00.000Z",
    );
  });
  it("moves early morning to 9am the same day", () => {
    const t = new Date("2026-12-10T05:00:00Z"); // 6am Lagos
    expect(outOfQuietHours(t, "Africa/Lagos").toISOString()).toBe("2026-12-10T08:00:00.000Z");
  });
  it("falls back to London for an unknown timezone", () => {
    const t = new Date("2026-12-10T22:00:00Z");
    expect(outOfQuietHours(t, "Not/AZone").toISOString()).toBe("2026-12-11T09:00:00.000Z");
  });
});

describe("parseTriggerPayload", () => {
  it("reads plain JSON", () => {
    expect(
      parseTriggerPayload({
        name: "Jane Smith",
        email: "Jane@Example.com",
        event: "invoice_paid",
        external_id: "INV-1",
      }),
    ).toEqual({
      name: "Jane Smith",
      email: "jane@example.com",
      phone: null,
      event: "invoice_paid",
      externalId: "INV-1",
    });
  });
  it("reads GoHighLevel style bodies (first and last name, customData)", () => {
    const r = parseTriggerPayload({
      first_name: "Tom",
      last_name: "Jones",
      phone: "+44 7700 900123",
      customData: { event: "job won", external_id: "J-9" },
    });
    expect(r).toMatchObject({
      name: "Tom Jones",
      phone: "+44 7700 900123",
      event: "job_done",
      externalId: "J-9",
    });
  });
  it("reads dotted form keys from Zapier or Make", () => {
    expect(
      parseTriggerPayload({ "contact.first_name": "Ada", "contact.email": "ada@x.com" }),
    ).toMatchObject({ name: "Ada", email: "ada@x.com", event: "manual" });
  });
  it("needs an email or phone", () => {
    expect(parseTriggerPayload({ name: "No Contact" })).toBeNull();
    expect(parseTriggerPayload(null)).toBeNull();
    expect(parseTriggerPayload([1])).toBeNull();
  });
});

describe("status chips and counts", () => {
  const base = {
    status: "waiting",
    remindersSent: 0,
    lastSentAt: "2026-10-20T10:00:00Z",
    skipReason: null,
    createdAt: "2026-10-20T10:00:00Z",
  };
  it("shows what happened", () => {
    expect(requestChips({ ...base, openedAt: "x", clickedAt: "x", remindersSent: 1 })).toEqual([
      "Sent",
      "Reminder 1 sent",
      "Opened",
      "Clicked review link",
    ]);
    expect(
      requestChips({ ...base, status: "skipped", lastSentAt: null, skipReason: "asked_recently" }),
    ).toEqual(["Skipped: asked recently"]);
    expect(requestChips({ ...base, status: "stopped", unsubscribedAt: "x" })).toEqual([
      "Sent",
      "Unsubscribed",
    ]);
  });
  it("counts the last 30 days only", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    const c = last30Counts(
      [
        { ...base, reviewedAt: "x" },
        { ...base, createdAt: "2026-08-01T00:00:00Z" },
        { ...base, status: "skipped", lastSentAt: null },
      ],
      now,
    );
    expect(c).toMatchObject({ sent: 1, reviewed: 1, skipped: 1 });
  });
});

describe("parseLine", () => {
  it("reads name and phone or email in any order", () => {
    expect(parseLine("Jane Smith, 07700 900123")).toEqual({
      name: "Jane Smith",
      phone: "07700 900123",
      email: null,
    });
    expect(parseLine("tom@example.com\tTom")).toEqual({
      name: "Tom",
      phone: null,
      email: "tom@example.com",
    });
    expect(parseLine("just a name")).toBeNull();
  });
});
