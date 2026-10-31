import { describe, expect, it } from "vitest";
import {
  inQueue,
  matchesSearch,
  openedSinceSent,
  opensLine,
  queueCounts,
  sendStatus,
  sentTime,
  sortQueue,
  type PipelineItem,
} from "./prospect-pipeline";

const base: PipelineItem = {
  name: "Shine Car Wash",
  town: "Newport",
  stage: "new",
  score: 50,
  sentAt: null,
  sentVia: null,
  opens: 0,
  lastOpenedAt: null,
  videoUrl: null,
  videoFirstPlayedAt: null,
};
const SENT = "2026-10-31T19:20:00Z"; // 19:20 in London (GMT from 25 Oct)

describe("sendStatus", () => {
  it("says not sent, ready, or sent with how and when", () => {
    expect(sendStatus(base)).toEqual({ tone: "grey", text: "Not sent yet", sent: false });
    expect(sendStatus({ ...base, videoUrl: "https://loom.com/x" })).toEqual({
      tone: "amber",
      text: "Ready to send: video added",
      sent: false,
    });
    expect(sendStatus({ ...base, sentAt: SENT, sentVia: "whatsapp" })).toEqual({
      tone: "green",
      text: "Sent by WhatsApp 31 Oct 19:20",
      sent: true,
    });
    expect(sendStatus({ ...base, sentAt: SENT, sentVia: "manual" }).text).toBe(
      "Marked as sent 31 Oct 19:20",
    );
  });

  it("uses UK summer time", () => {
    expect(sentTime("2026-07-01T08:05:00Z")).toBe("1 Jul 09:05");
  });
});

describe("opens", () => {
  it("only counts opens after sending", () => {
    expect(opensLine(base)).toBe("");
    expect(opensLine({ ...base, opens: 4, lastOpenedAt: SENT })).toBe("");
    const sent = { ...base, sentAt: SENT };
    expect(opensLine(sent)).toBe("Not opened yet");
    expect(opensLine({ ...sent, opens: 3, lastOpenedAt: "2026-10-31T10:00:00Z" })).toBe(
      "Not opened yet",
    );
    expect(opensLine({ ...sent, opens: 1, lastOpenedAt: "2026-11-01T09:00:00Z" })).toBe(
      "Opened 1 time since you sent it",
    );
    expect(opensLine({ ...sent, opens: 2, lastOpenedAt: "2026-11-01T09:00:00Z" })).toBe(
      "Opened 2 times since you sent it",
    );
    expect(openedSinceSent({ ...sent, opens: 0, lastOpenedAt: "2026-11-01T09:00:00Z" })).toBe(
      false,
    );
  });
});

describe("queues", () => {
  const todo = { ...base, score: 40 };
  const ready = { ...base, score: 80, videoUrl: "v" };
  const waiting = { ...base, stage: "sent", sentAt: SENT };
  const opened = { ...waiting, stage: "opened", opens: 2, lastOpenedAt: "2026-11-01T09:00:00Z" };
  const watched = { ...opened, videoUrl: "v", videoFirstPlayedAt: "2026-11-01T09:01:00Z" };
  const replied = { ...waiting, stage: "replied" };
  const lostUnsent = { ...base, stage: "lost" };

  it("puts each prospect in the right queues", () => {
    expect(inQueue(todo, "todo")).toBe(true);
    expect(inQueue(todo, "ready")).toBe(false);
    expect(inQueue(ready, "todo")).toBe(true);
    expect(inQueue(ready, "ready")).toBe(true);
    expect(inQueue(waiting, "waiting")).toBe(true);
    expect(inQueue(waiting, "todo")).toBe(false);
    expect(inQueue(opened, "waiting")).toBe(false);
    expect(inQueue(opened, "opened")).toBe(true);
    expect(inQueue(watched, "watched")).toBe(true);
    expect(inQueue(replied, "replied")).toBe(true);
    expect(inQueue(replied, "waiting")).toBe(false);
    expect(inQueue(lostUnsent, "todo")).toBe(false);
    expect(inQueue(lostUnsent, "lost")).toBe(true);
    expect(inQueue(lostUnsent, "all")).toBe(true);
  });

  it("counts and sorts", () => {
    const list = [todo, ready, waiting, opened, watched, replied, lostUnsent];
    const c = queueCounts(list);
    expect(c.todo).toBe(2);
    expect(c.ready).toBe(1);
    expect(c.waiting).toBe(1);
    expect(c.opened).toBe(2);
    expect(c.all).toBe(7);
    expect(sortQueue([todo, ready, { ...base, score: null }], "todo").map((p) => p.score)).toEqual([
      80,
      40,
      null,
    ]);
    const later = { ...waiting, sentAt: "2026-11-02T10:00:00Z" };
    expect(sortQueue([waiting, later], "waiting")[0]).toBe(later);
  });

  it("searches name and town", () => {
    expect(matchesSearch(base, "")).toBe(true);
    expect(matchesSearch(base, "shine")).toBe(true);
    expect(matchesSearch(base, "NEWPORT")).toBe(true);
    expect(matchesSearch(base, "cardiff")).toBe(false);
  });
});
