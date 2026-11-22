import { describe, expect, it } from "vitest";
import {
  joinLink,
  nudgeDue,
  nudgeSms,
  pickAppointment,
  safeMeet,
  FIT_CALL_CALENDAR,
} from "./growth-join";

describe("growth join", () => {
  const start = "2026-11-23T11:45:00Z";
  it("nudges between 3 and 15 minutes after the start", () => {
    expect(nudgeDue(start, new Date("2026-11-23T11:47:30Z"))).toBe(false);
    expect(nudgeDue(start, new Date("2026-11-23T11:48:00Z"))).toBe(true);
    expect(nudgeDue(start, new Date("2026-11-23T12:00:00Z"))).toBe(true);
    expect(nudgeDue(start, new Date("2026-11-23T12:01:00Z"))).toBe(false);
  });
  it("only opens Google Meet links", () => {
    expect(safeMeet("https://meet.google.com/aib-imyg-ovk")).toBe(
      "https://meet.google.com/aib-imyg-ovk",
    );
    expect(safeMeet("https://evil.test/x")).toBeNull();
    expect(safeMeet("")).toBeNull();
  });
  it("picks the Fit Call nearest now, ignoring deleted and other calendars", () => {
    const ev = [
      { id: "a", startTime: "2026-11-23T11:45:00Z", calendarId: FIT_CALL_CALENDAR },
      { id: "b", startTime: "2026-11-23T11:50:00Z", calendarId: "other" },
      { id: "c", startTime: "2026-11-23 11:46:00", calendarId: FIT_CALL_CALENDAR, deleted: true },
      { id: "d", startTime: "2026-11-25T09:15:00Z", calendarId: FIT_CALL_CALENDAR },
    ];
    expect(pickAppointment(ev, new Date("2026-11-23T11:40:00Z"))?.id).toBe("a");
    expect(pickAppointment(ev, new Date("2026-11-24T11:40:00Z"))).toBeNull();
  });
  it("writes a short nudge with a tappable link", () => {
    const m = nudgeSms("joanna", joinLink("abc123"));
    expect(m).toBe(
      "Hi Joanna, we're on the call now and ready when you are: https://repsuites.com/api/join?c=abc123 Accelur8",
    );
    expect(m).not.toContain("—");
  });
});
