import { describe, expect, it, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "./stripe.server";

describe("verifyStripeSignature", () => {
  beforeAll(() => {
    process.env["REPSUITES_STRIPE_WEBHOOK_SECRET"] = "whsec_test";
  });
  const body = '{"id":"evt_1"}';
  const sign = (t: number, b = body, s = "whsec_test") =>
    `t=${t},v1=${createHmac("sha256", s).update(`${t}.${b}`).digest("hex")}`;
  it("accepts a fresh, correct signature", async () => {
    expect(await verifyStripeSignature(body, sign(Math.floor(Date.now() / 1000)))).toBe(true);
  });
  it("rejects a changed body, wrong secret, old timestamp or no header", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verifyStripeSignature(body + " ", sign(now))).toBe(false);
    expect(await verifyStripeSignature(body, sign(now, body, "other"))).toBe(false);
    expect(await verifyStripeSignature(body, sign(now - 600))).toBe(false);
    expect(await verifyStripeSignature(body, null)).toBe(false);
  });
});
