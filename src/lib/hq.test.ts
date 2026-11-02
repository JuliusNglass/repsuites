import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  customerOptOutEvent,
  hqBody,
  hqEventForStripe,
  isRepsuitesBilling,
  prospectHqEvent,
  reviewRequestedEvent,
  stripeHqEvent,
  stripeMetadata,
  subscriptionPence,
} from "./hq";
import { buildHqRequest, HQ_DEFAULT_URL, hqAfter, sendHqEvent, signHq } from "./hq.server";
import { ghlProspectUrl, GHL_DEFAULT_URL } from "./ghl-prospect";

const TENANT = "11111111-2222-4333-8444-555555555555";
const SECRET = "test-secret-not-real";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["HQ_CRM_SECRET"];
  delete process.env["HQ_CRM_URL"];
});

describe("HQ signing", () => {
  it("is lowercase hex HMAC-SHA256 of <timestamp>.<raw body>", async () => {
    const raw = '{"event":"signed_up"}';
    const want = createHmac("sha256", SECRET).update(`1761998400.${raw}`).digest("hex");
    const got = await signHq(SECRET, "1761998400", raw);
    expect(got).toBe(want);
    expect(got).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signs exactly the body it sends, with unix-second timestamp", async () => {
    const now = Date.parse("2026-11-01T12:00:00Z");
    const req = await buildHqRequest(
      {
        event: "signed_up",
        idempotency_key: `tenant:${TENANT}:signed_up`,
        occurred_at: "2026-11-01T12:00:00.000Z",
        contact: { email: "owner@example.com", name: "Test Owner", role: "owner" },
        company: { name: "Test Bakery" },
        product_link: { type: "tenant", id: TENANT },
      },
      SECRET,
      now,
    );
    expect(req.url).toBe(HQ_DEFAULT_URL);
    expect(req.headers["x-accelur8-timestamp"]).toBe("1793534400");
    expect(req.headers["x-accelur8-signature"]).toBe(
      createHmac("sha256", SECRET).update(`1793534400.${req.raw}`).digest("hex"),
    );
    expect(JSON.parse(req.raw)).toEqual({
      source: "repsuites",
      event: "signed_up",
      idempotency_key: `tenant:${TENANT}:signed_up`,
      occurred_at: "2026-11-01T12:00:00.000Z",
      contact: { email: "owner@example.com", name: "Test Owner", role: "owner" },
      company: { name: "Test Bakery" },
      product_link: { product: "repsuites", type: "tenant", id: TENANT },
    });
  });

  it("uses HQ_CRM_URL when set", async () => {
    process.env["HQ_CRM_URL"] = "https://hq.example.test/crm-event";
    const req = await buildHqRequest(
      { event: "client_added", idempotency_key: "k", contact: {} },
      SECRET,
    );
    expect(req.url).toBe("https://hq.example.test/crm-event");
  });
});

describe("sendHqEvent (no real HQ calls)", () => {
  const e = { event: "signed_up" as const, idempotency_key: "k1", contact: {} };

  it("does nothing without the secret", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await sendHqEvent(e)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("posts once, signed, and reports success", async () => {
    process.env["HQ_CRM_SECRET"] = SECRET;
    process.env["HQ_CRM_URL"] = "https://hq.example.test/crm-event";
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await sendHqEvent(e)).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hq.example.test/crm-event");
    const h = init.headers as Record<string, string>;
    expect(h["x-accelur8-signature"]).toBe(
      createHmac("sha256", SECRET)
        .update(`${h["x-accelur8-timestamp"]}.${String(init.body)}`)
        .digest("hex"),
    );
  });

  it("never throws: network errors and HQ errors are false", async () => {
    process.env["HQ_CRM_SECRET"] = SECRET;
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(await sendHqEvent(e)).toBe(false);
    vi.stubGlobal("fetch", async () => new Response("no", { status: 401 }));
    expect(await sendHqEvent(e)).toBe(false);
  });

  it("hqAfter swallows a failing builder", async () => {
    expect(
      await hqAfter(() => {
        throw new Error("lookup failed");
      }),
    ).toBe(false);
    expect(await hqAfter(async () => null)).toBe(false);
  });
});

describe("Stripe to HQ events", () => {
  const sub = (status: string, meta: Record<string, string>) => ({
    object: "subscription",
    id: "sub_test1",
    customer: "cus_test1",
    status,
    metadata: meta,
    items: { data: [{ price: { unit_amount: 2900 }, quantity: 1 }] },
  });
  const planMeta = { kind: "plan", product: "repsuites", tenant_id: TENANT, plan: "pro" };

  it("maps event types", () => {
    expect(hqEventForStripe("invoice.paid", { amount_paid: 2900 })).toBe("plan_paid");
    expect(hqEventForStripe("invoice.paid", { amount_paid: 0 })).toBeNull();
    expect(hqEventForStripe("invoice.payment_failed", {})).toBe("payment_failed");
    expect(hqEventForStripe("customer.subscription.deleted", {})).toBe("cancelled");
    expect(hqEventForStripe("customer.subscription.created", { status: "trialing" })).toBe(
      "trial_started",
    );
    expect(hqEventForStripe("customer.subscription.created", { status: "active" })).toBeNull();
    expect(hqEventForStripe("checkout.session.completed", {})).toBeNull();
  });

  it("trial started: tenant link, plan value, Stripe ids, deterministic key", () => {
    const e = stripeHqEvent({
      id: "evt_test1",
      created: 1793534400,
      type: "customer.subscription.created",
      data: { object: sub("trialing", planMeta) },
    });
    expect(e).toMatchObject({
      tenantId: TENANT,
      event: "trial_started",
      idempotency_key: "stripe:evt_test1",
      occurred_at: "2026-11-01T12:00:00.000Z",
      product_link: { type: "tenant", id: TENANT },
      value_pence: 2900,
      data: { stripe_customer: "cus_test1", stripe_subscription: "sub_test1", plan: "pro" },
    });
  });

  it("cancelled", () => {
    const e = stripeHqEvent({
      id: "evt_test2",
      type: "customer.subscription.deleted",
      data: { object: sub("canceled", planMeta) },
    });
    expect(e?.event).toBe("cancelled");
    expect(e?.idempotency_key).toBe("stripe:evt_test2");
  });

  it("invoice paid and failed read the subscription metadata (new and old API shapes)", () => {
    const paid = stripeHqEvent({
      id: "evt_test3",
      type: "invoice.paid",
      data: {
        object: {
          object: "invoice",
          id: "in_test1",
          customer: "cus_test1",
          customer_email: "owner@example.com",
          amount_paid: 2900,
          parent: { subscription_details: { metadata: planMeta } },
        },
      },
    });
    expect(paid).toMatchObject({
      event: "plan_paid",
      value_pence: 2900,
      tenantId: TENANT,
      contact: { email: "owner@example.com" },
      data: { stripe_invoice: "in_test1", stripe_customer: "cus_test1" },
    });
    const failed = stripeHqEvent({
      id: "evt_test4",
      type: "invoice.payment_failed",
      data: {
        object: {
          object: "invoice",
          customer: "cus_test1",
          amount_paid: 0,
          amount_due: 2900,
          subscription_details: { metadata: planMeta },
        },
      },
    });
    expect(failed).toMatchObject({ event: "payment_failed", value_pence: 2900 });
  });

  it("falls back to the Stripe customer when the tenant is unknown", () => {
    const e = stripeHqEvent({
      id: "evt_test5",
      type: "invoice.paid",
      data: {
        object: {
          object: "invoice",
          customer: "cus_test9",
          amount_paid: 500,
          lines: { data: [{ metadata: { product: "repsuites" } }] },
        },
      },
    });
    expect(e?.product_link).toEqual({ type: "stripe_customer", id: "cus_test9" });
    expect(e?.tenantId).toBeNull();
  });

  it("ignores other products and unlabelled non-plan billing", () => {
    expect(
      stripeHqEvent({
        id: "evt_test6",
        type: "customer.subscription.deleted",
        data: { object: sub("canceled", { product: "sparkops", tenant_id: TENANT }) },
      }),
    ).toBeNull();
    expect(
      stripeHqEvent({
        id: "evt_test7",
        type: "invoice.paid",
        data: { object: { object: "invoice", customer: "cus_x", amount_paid: 100 } },
      }),
    ).toBeNull();
    expect(isRepsuitesBilling({ kind: "plan", plan: "starter" })).toBe(true);
    expect(isRepsuitesBilling({ kind: "plan", plan: "nope" })).toBe(false);
  });

  it("reads metadata and prices", () => {
    expect(stripeMetadata({ object: "invoice", metadata: { tenant_id: "x" } })).toEqual({});
    expect(
      subscriptionPence({
        items: { data: [{ price: { unit_amount: 1000 }, quantity: 2 }, { plan: { amount: 500 } }] },
      }),
    ).toBe(2500);
    expect(subscriptionPence({ items: { data: [] } })).toBeNull();
  });
});

describe("prospect, opt-out and review events", () => {
  const p = {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    name: "Test Cleaners",
    contact_name: "Test Person",
    phone: "+447700900000",
    email: null,
    website: "https://example.com",
    town: "Testtown",
    report_token: "tok123",
    product: "sparkops",
  };

  it("prospect_created and prospect_sent have their own deterministic keys", () => {
    const c = prospectHqEvent("prospect_created", p, { source: "search" });
    const s = prospectHqEvent("prospect_sent", p, { via: "whatsapp" });
    expect(c.idempotency_key).toBe(`prospect:${p.id}:created`);
    expect(s.idempotency_key).toBe(`prospect:${p.id}:sent`);
    expect(s).toMatchObject({
      event: "prospect_sent",
      contact: { phone: "+447700900000", name: "Test Person", email: null },
      company: { name: "Test Cleaners", town: "Testtown" },
      product_link: { type: "prospect", id: p.id },
      data: { product: "sparkops", report_url: "https://repsuites.com/r/tok123", via: "whatsapp" },
    });
    expect(hqBody(s).product_link).toEqual({ product: "repsuites", type: "prospect", id: p.id });
  });

  it("customer opt-outs are scoped to the product customer", () => {
    const e = customerOptOutEvent({
      requestId: "r1",
      tenantId: TENANT,
      business: "Test Bakery",
      email: "customer@example.com",
      phone: null,
      name: "Test Customer",
      how: "unsubscribe",
    });
    expect(e).toMatchObject({
      event: "opted_out",
      scope: "product_customer",
      idempotency_key: "review_request:r1:opted_out",
      product_link: { type: "tenant", id: TENANT },
    });
    expect(hqBody(e).scope).toBe("product_customer");
  });

  it("review_requested is one activity per batch", () => {
    const e = reviewRequestedEvent({
      tenantId: TENANT,
      batchKey: "tokA",
      business: null,
      added: 3,
      skipped: 1,
      source: "manual",
      channels: ["email"],
    });
    expect(e.idempotency_key).toBe(`review_requests:${TENANT}:tokA`);
    expect(e.data).toEqual({ added: 3, skipped: 1, source: "manual", channels: ["email"] });
  });
});

describe("GHL prospect push switch", () => {
  it("keeps the default, can be switched off, and skips bad config", () => {
    expect(ghlProspectUrl(undefined)).toBe(GHL_DEFAULT_URL);
    expect(ghlProspectUrl("")).toBe(GHL_DEFAULT_URL);
    expect(ghlProspectUrl("off")).toBeNull();
    expect(ghlProspectUrl("OFF ")).toBeNull();
    expect(ghlProspectUrl("not a url")).toBeNull();
    expect(ghlProspectUrl("https://hooks.example.test/x")).toBe("https://hooks.example.test/x");
  });
});
