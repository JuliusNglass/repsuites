import { describe, expect, it } from "vitest";
import { afterSend, fillMessage, intlDigits, parseLine, whatsappLink } from "./review-requests";

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
  it("schedules a reminder, then finishes", () => {
    const a = afterSend(0, 1, 3, now);
    expect(a.status).toBe("waiting");
    expect(a.dueAt).toBe("2026-11-02T12:00:00.000Z"); // 3 days later
    expect(afterSend(1, 1, 3, now).status).toBe("finished");
    expect(afterSend(0, 0, 3, now).status).toBe("finished");
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
