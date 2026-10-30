import { describe, expect, it } from "vitest";
import { eligible, emailFor, nextEmail, oneNumber, type Facts } from "./lifecycle";

const now = new Date("2027-01-20T09:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

const base = (over: Partial<Facts> = {}): Facts => ({
  tenant_id: "t1",
  name: "Cafe Nova",
  created_at: daysAgo(1),
  plan: "free",
  billing_status: null,
  legacy: false,
  self_serve: true,
  owner_email: "owner@cafe.test",
  owner_name: "Sam Jones",
  email_confirmed: true,
  last_seen_at: daysAgo(0),
  unsubscribed: false,
  unsub_token: "00000000-0000-0000-0000-000000000000",
  google_connected: false,
  scans_total: 0,
  scans_7d: 0,
  feedback_total: 0,
  feedback_7d: 0,
  requests_sent: 0,
  replies_total: 0,
  orders_paid: 0,
  ...over,
});

describe("who can get follow-ups", () => {
  it("skips test businesses, unconfirmed emails, unsubscribes and managed legacy accounts", () => {
    expect(eligible(base())).toBe(true);
    expect(eligible(base({ name: "Test Cafe Newport" }))).toBe(false);
    expect(eligible(base({ email_confirmed: false }))).toBe(false);
    expect(eligible(base({ unsubscribed: true }))).toBe(false);
    expect(eligible(base({ legacy: true, self_serve: false, plan: "gold" }))).toBe(false);
    expect(
      eligible(base({ legacy: true, self_serve: false, plan: "gold", billing_status: "active" })),
    ).toBe(true);
  });
});

describe("which email today", () => {
  it("day 1: nothing yet", () => {
    expect(nextEmail(base(), [], now)).toBe(null);
  });
  it("day 2 without Google: connect Google", () => {
    expect(nextEmail(base({ created_at: daysAgo(2) }), [], now)).toBe("connect_google");
  });
  it("day 3 with Google but no scans: print the QR code", () => {
    expect(nextEmail(base({ created_at: daysAgo(3), google_connected: true }), [], now)).toBe(
      "print_qr",
    );
  });
  it("day 8 and active: Growth upsell", () => {
    const f = base({ created_at: daysAgo(8), google_connected: true, scans_total: 12 });
    expect(nextEmail(f, [], now)).toBe("growth_upsell");
  });
  it("never more than one email every 3 days, and each type once", () => {
    const f = base({ created_at: daysAgo(8), google_connected: false, scans_total: 0 });
    expect(nextEmail(f, [{ type: "connect_google", sent_at: daysAgo(1) }], now)).toBe(null);
    expect(nextEmail(f, [{ type: "connect_google", sent_at: daysAgo(4) }], now)).toBe("print_qr");
  });
  it("quiet for 7 days, then 30 days", () => {
    expect(
      nextEmail(
        base({
          created_at: daysAgo(60),
          last_seen_at: daysAgo(8),
          google_connected: true,
          scans_total: 3,
        }),
        [],
        now,
      ),
    ).toBe("nudge_7");
    expect(
      nextEmail(
        base({
          created_at: daysAgo(60),
          last_seen_at: daysAgo(31),
          google_connected: true,
          scans_total: 3,
        }),
        [],
        now,
      ),
    ).toBe("winback_30");
  });
  it("paying: late payment first, then stand upsell when people are scanning", () => {
    const paid = base({
      plan: "gold",
      billing_status: "active",
      created_at: daysAgo(20),
      google_connected: true,
      scans_7d: 4,
      scans_total: 9,
    });
    expect(nextEmail(paid, [], now)).toBe("stand_upsell_paid");
    expect(nextEmail({ ...paid, billing_status: "past_due" }, [], now)).toBe("past_due");
    expect(nextEmail({ ...paid, orders_paid: 1 }, [], now)).toBe(null);
  });
});

describe("email text", () => {
  it("uses their numbers, has an unsubscribe link and no em dashes", () => {
    const f = base({ created_at: daysAgo(8), scans_total: 12, scans_7d: 5 });
    const e = emailFor("growth_upsell", f, "https://repsuites.com/api/unsubscribe?t=x");
    expect(e.subject).toContain("12 people have scanned your code");
    expect(e.html).toContain("Hi Sam");
    expect(e.html).toContain("Stop these emails");
    expect(e.html + e.subject).not.toContain("—");
    expect(oneNumber(f)).toBe("5 people scanned your review code in the last week.");
  });
});

describe("before sign-ins were tracked", () => {
  it("does not call older accounts quiet just because we have no record", () => {
    const early = new Date("2026-11-03T09:00:00Z");
    const f = base({
      created_at: "2026-01-01T00:00:00Z",
      last_seen_at: null,
      plan: "gold",
      billing_status: "active",
      google_connected: true,
    });
    expect(nextEmail(f, [], early)).toBe(null);
  });
});
