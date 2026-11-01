import { describe, expect, it } from "vitest";
import {
  campaignQuota,
  campaignStopReason,
  CAMPAIGN_MAX,
  clampRate,
  classifyContacts,
  csvRows,
  parseContacts,
  parseDate,
  progressOf,
} from "./campaigns";

describe("CSV", () => {
  it("handles quotes, commas inside quotes, CRLF and a BOM", () => {
    expect(
      csvRows('\uFEFFname,email\r\n"Smith, Jane",jane@x.com\r\n"Tom ""TJ"" Jones",tj@x.com\n'),
    ).toEqual([
      ["name", "email"],
      ["Smith, Jane", "jane@x.com"],
      ['Tom "TJ" Jones', "tj@x.com"],
    ]);
  });
  it("reads tab and semicolon separated lists", () => {
    expect(csvRows("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(csvRows("a;b")).toEqual([["a", "b"]]);
  });
  it("maps header columns in any order, with first and last name", () => {
    const r = parseContacts(
      "Mobile,Surname,First Name,Email Address,Last job date\n07700 900123,Smith,Jane,JANE@X.COM,14/03/2025\n,Lee,Ann,,\n",
    );
    expect(r.contacts).toEqual([
      { name: "Jane Smith", email: "jane@x.com", phone: "07700 900123", lastJobDate: "2025-03-14" },
    ]);
    expect(r.unreadable).toBe(1);
  });
  it("reads a pasted list with no header", () => {
    const r = parseContacts(
      "Jane Smith, 07700 900123\nTom, tom@example.com, 2024-12-01\nnothing here",
    );
    expect(r.contacts).toEqual([
      { name: "Jane Smith", email: null, phone: "07700 900123", lastJobDate: null },
      { name: "Tom", email: "tom@example.com", phone: null, lastJobDate: "2024-12-01" },
    ]);
    expect(r.unreadable).toBe(1);
  });
  it("parses dates and rejects impossible ones", () => {
    expect(parseDate("2025-02-28")).toBe("2025-02-28");
    expect(parseDate("31/12/24")).toBe("2024-12-31");
    expect(parseDate("31/02/2025")).toBeNull();
    expect(parseDate("soon")).toBeNull();
  });
});

describe("preview and dedupe", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const ctx = {
    countryCode: "44",
    cooldownDays: 90,
    past: [
      {
        email: "asked@x.com",
        phone_key: null,
        status: "finished",
        created_at: "2026-10-01T00:00:00Z",
      },
      {
        email: "old@x.com",
        phone_key: null,
        status: "finished",
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    optedOut: new Set(["gone@x.com", "447700900999"]),
    now,
  };
  it("counts every reason and keeps the ready ones", () => {
    const { ready, counts } = classifyContacts(
      [
        { name: "A", email: "a@x.com", phone: null, lastJobDate: null },
        { name: "A again", email: "A@X.com", phone: null, lastJobDate: null },
        { name: "B", email: null, phone: "07700 900123", lastJobDate: null },
        { name: "B again", email: "b2@x.com", phone: "+44 7700 900123", lastJobDate: null },
        { name: "C", email: "asked@x.com", phone: null, lastJobDate: null },
        { name: "D", email: "old@x.com", phone: null, lastJobDate: null },
        { name: "E", email: "gone@x.com", phone: null, lastJobDate: null },
        { name: "F", email: null, phone: "07700 900999", lastJobDate: null },
        { name: "G", email: "broken@", phone: null, lastJobDate: null },
      ],
      ctx,
    );
    expect(ready.map((r) => r.name)).toEqual(["A", "B", "D"]);
    expect(counts).toEqual({
      rows: 9,
      validEmails: 2,
      phoneOnly: 1,
      badEmails: 1,
      duplicates: 2,
      askedRecently: 1,
      unsubscribed: 2,
      overCap: 0,
      ready: 3,
    });
  });
  it("caps a campaign at 2,000", () => {
    const many = Array.from({ length: CAMPAIGN_MAX + 5 }, (_, i) => ({
      name: "",
      email: `p${i}@x.com`,
      phone: null,
      lastJobDate: null,
    }));
    const r = classifyContacts(many, { ...ctx, past: [], optedOut: new Set() });
    expect(r.counts.ready).toBe(CAMPAIGN_MAX);
    expect(r.counts.overCap).toBe(5);
  });
});

describe("send rate", () => {
  const base = { quietStart: 20, quietEnd: 9 }; // 11 open hours: 9am to 8pm
  it("spreads the daily rate over the open hours", () => {
    // 25 a day over 11 hours = 3 an hour.
    expect(
      campaignQuota({ ...base, dailyRate: 25, queuedLast24h: 0, queuedLastHour: 0, localHour: 9 }),
    ).toBe(3);
    expect(
      campaignQuota({ ...base, dailyRate: 25, queuedLast24h: 3, queuedLastHour: 3, localHour: 9 }),
    ).toBe(0);
    expect(
      campaignQuota({
        ...base,
        dailyRate: 100,
        queuedLast24h: 0,
        queuedLastHour: 0,
        localHour: 12,
      }),
    ).toBe(10);
  });
  it("sends nothing in quiet hours", () => {
    expect(
      campaignQuota({ ...base, dailyRate: 25, queuedLast24h: 0, queuedLastHour: 0, localHour: 22 }),
    ).toBe(0);
    expect(
      campaignQuota({ ...base, dailyRate: 25, queuedLast24h: 0, queuedLastHour: 0, localHour: 8 }),
    ).toBe(0);
  });
  it("never goes over the daily rate in any 24 hours", () => {
    expect(
      campaignQuota({
        ...base,
        dailyRate: 25,
        queuedLast24h: 24,
        queuedLastHour: 0,
        localHour: 18,
      }),
    ).toBe(1);
    expect(
      campaignQuota({
        ...base,
        dailyRate: 25,
        queuedLast24h: 25,
        queuedLastHour: 0,
        localHour: 18,
      }),
    ).toBe(0);
  });
  it("a full day of 10 minute runs sends exactly the daily rate", () => {
    let total = 0;
    const log: number[] = []; // minute of the day each one was queued
    for (let m = 0; m < 24 * 60; m += 10) {
      const q = campaignQuota({
        ...base,
        dailyRate: 25,
        queuedLast24h: log.length,
        queuedLastHour: log.filter((t) => t > m - 60).length,
        localHour: Math.floor(m / 60),
      });
      for (let i = 0; i < q; i++) log.push(m);
      total += q;
    }
    expect(total).toBe(25);
  });
  it("keeps the rate between 10 and 100", () => {
    expect(clampRate(5)).toBe(10);
    expect(clampRate(500)).toBe(100);
    expect(clampRate(Number.NaN)).toBe(25);
  });
});

describe("automatic stop", () => {
  it("stops on more than 5% bounces or 2% unsubscribes", () => {
    expect(campaignStopReason({ sent: 100, bounced: 5, unsubscribed: 2 })).toBeNull();
    expect(campaignStopReason({ sent: 100, bounced: 6, unsubscribed: 0 })).toMatch(/bounced/);
    expect(campaignStopReason({ sent: 100, bounced: 0, unsubscribed: 3 })).toMatch(/unsubscribed/);
  });
  it("does not stop on one early bounce", () => {
    expect(campaignStopReason({ sent: 3, bounced: 1, unsubscribed: 1 })).toBeNull();
    expect(campaignStopReason({ sent: 10, bounced: 3, unsubscribed: 0 })).toMatch(/bounced/);
  });
  it("counts progress", () => {
    expect(
      progressOf(10, 4, [
        { status: "finished", first_sent_at: "x", clicked_at: "x", reviewed_at: "x" },
        { status: "waiting", first_sent_at: "x", clicked_at: null, reviewed_at: null },
        { status: "skipped", first_sent_at: null, clicked_at: null, reviewed_at: null },
      ]),
    ).toEqual({ total: 10, waiting: 4, queued: 2, sent: 2, clicked: 1, reviewed: 1, skipped: 1 });
  });
});
