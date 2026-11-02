/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for Stripe and Supabase JSON. */
// The 14-day free trial flow, with fetch mocked: Stripe is never called.
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  writes: [] as { endpoint: string; options: any }[],
  billing: [] as any[],
}));
vi.mock("./supabase-service.server", () => ({
  serviceRead: vi.fn(async (endpoint: string) => {
    if (endpoint.startsWith("tenant_billing")) return { data: db.billing, error: null };
    return { data: [], error: null };
  }),
  serviceWrite: vi.fn(async (endpoint: string, _jwt: string, options: any) => {
    db.writes.push({ endpoint, options });
    // stripe_events: a new event id comes back as one inserted row.
    if (endpoint.startsWith("stripe_events?on_conflict"))
      return { data: [{ id: options.body.id }], error: null };
    return { data: null, error: null };
  }),
}));
vi.mock("./email.server", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));

import { startTrialCheckout, startTrialFromSession, trialSubscriptionBody } from "./trial.server";
import { handleStripeWebhook } from "./stripe-webhook.server";

const TENANT = "11111111-2222-4333-8444-555555555555";
const WHSEC = "whsec_test_not_real";

type Call = { url: string; method: string; form: URLSearchParams; headers: Record<string, string> };
let calls: Call[] = [];

// A fake Stripe: answers by path, records every request.
function fakeStripe(over: Record<string, (c: Call) => [number, unknown]> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any = {}) => {
      const c: Call = {
        url,
        method: init.method ?? "GET",
        form: new URLSearchParams(init.body ?? ""),
        headers: init.headers ?? {},
      };
      calls.push(c);
      // Accelur8 HQ (the CRM): accept the event.
      if (!url.startsWith("https://api.stripe.com/")) return new Response("{}", { status: 200 });
      const path = url.replace("https://api.stripe.com/v1/", "");
      const hit = Object.entries(over).find(([p]) => path === p);
      const [status, body] = hit
        ? hit[1](c)
        : path.startsWith("setup_intents/")
          ? [200, { id: "seti_test1", payment_method: "pm_test1" }]
          : path.startsWith("products/")
            ? [200, { id: path.slice(9) }]
            : path === "subscriptions"
              ? [
                  200,
                  {
                    id: "sub_test1",
                    object: "subscription",
                    customer: c.form.get("customer"),
                    status: "trialing",
                    trial_end: Number(c.form.get("trial_end")),
                    items: {
                      data: [
                        {
                          current_period_end: Number(c.form.get("trial_end")),
                          price: {
                            unit_amount: Number(c.form.get("items[0][price_data][unit_amount]")),
                          },
                          quantity: 1,
                        },
                      ],
                    },
                    metadata: {
                      kind: c.form.get("metadata[kind]"),
                      product: c.form.get("metadata[product]"),
                      tenant_id: c.form.get("metadata[tenant_id]"),
                      plan: c.form.get("metadata[plan]"),
                    },
                  },
                ]
              : path === "customers"
                ? [200, { id: "cus_new1" }]
                : path === "checkout/sessions"
                  ? [
                      200,
                      { id: "cs_test_setup1", url: "https://checkout.stripe.com/c/pay/cs_test" },
                    ]
                  : [404, { error: { message: "not mocked" } }];
      return new Response(JSON.stringify(body), { status });
    }),
  );
}

const session = (over: Record<string, unknown> = {}) => ({
  id: "cs_test_setup1",
  object: "checkout.session",
  mode: "setup",
  customer: "cus_test1",
  setup_intent: "seti_test1",
  metadata: { kind: "plan", product: "repsuites", tenant_id: TENANT, plan: "gold", trial: "1" },
  ...over,
});

function signed(event: unknown) {
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", WHSEC).update(`${t}.${raw}`).digest("hex");
  return { raw, sig: `t=${t},v1=${v1}` };
}

beforeEach(() => {
  calls = [];
  db.writes = [];
  db.billing = [];
  process.env["REPSUITES_STRIPE_SECRET_KEY"] = "sk_test_not_real";
  process.env["REPSUITES_STRIPE_WEBHOOK_SECRET"] = WHSEC;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["HQ_CRM_SECRET"];
});

describe("trial subscription parameters", () => {
  it("worked example: sign up 20 Nov, trial to 9am 4 Dec, anchored 9am 1 Jan, part-month prorated", () => {
    const body = trialSubscriptionBody({
      tenantId: TENANT,
      plan: "gold",
      customer: "cus_test1",
      paymentMethod: "pm_test1",
      sessionId: "cs_test_setup1",
      today: "2026-11-20",
    });
    expect(body).toEqual({
      customer: "cus_test1",
      items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            product: "repsuites_growth",
            unit_amount: 4900,
            recurring: { interval: "month" },
          },
        },
      ],
      default_payment_method: "pm_test1",
      trial_end: Date.parse("2026-12-04T09:00:00Z") / 1000,
      billing_cycle_anchor: Date.parse("2027-01-01T09:00:00Z") / 1000,
      proration_behavior: "create_prorations",
      metadata: {
        kind: "plan",
        product: "repsuites",
        tenant_id: TENANT,
        plan: "gold",
        checkout_session: "cs_test_setup1",
      },
    });
    // What Stripe will charge on 4 Dec: £49 x 28/31 = £44.26 (4426p), then 4900p on 1 Jan.
    expect(Math.round((4900 * 28) / 31)).toBe(4426);
  });
  it("a trial ending on the 1st has no anchor (it already bills on the 1st)", () => {
    const body = trialSubscriptionBody({
      tenantId: TENANT,
      plan: "gold",
      customer: "c",
      paymentMethod: "p",
      sessionId: "s",
      today: "2026-11-17",
    });
    expect(body.trial_end).toBe(Date.parse("2026-12-01T09:00:00Z") / 1000);
    expect(body).not.toHaveProperty("billing_cycle_anchor");
  });
});

describe("startTrialCheckout", () => {
  it("makes a customer, then a setup-mode Checkout that charges nothing", async () => {
    fakeStripe();
    const r = await startTrialCheckout({
      tenantId: TENANT,
      plan: "gold",
      email: "owner@example.com",
      customer: null,
    });
    expect(r).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test" });
    expect(calls.map((c) => c.url.replace("https://api.stripe.com/v1/", ""))).toEqual([
      "customers",
      "checkout/sessions",
    ]);
    expect(calls[0]!.form.get("metadata[tenant_id]")).toBe(TENANT);
    const f = calls[1]!.form;
    expect(f.get("mode")).toBe("setup");
    expect(f.get("currency")).toBe("gbp");
    expect(f.get("customer")).toBe("cus_new1");
    expect(f.get("metadata[product]")).toBe("repsuites");
    expect(f.get("metadata[tenant_id]")).toBe(TENANT);
    expect(f.get("metadata[kind]")).toBe("plan");
    expect(f.get("metadata[trial]")).toBe("1");
    expect(f.get("setup_intent_data[metadata][tenant_id]")).toBe(TENANT);
    expect(f.get("custom_text[submit][message]")).toMatch(/Free until .* Nothing is taken today\./);
    expect(f.get("custom_text[submit][message]")).not.toMatch(/—|\bwas\b|\bsave\b/i);
    expect([...f.keys()].some((k) => k.startsWith("line_items"))).toBe(false);
    // The new customer is remembered for next time.
    expect(db.writes[0]?.options.body).toMatchObject({
      tenant_id: TENANT,
      stripe_customer_id: "cus_new1",
    });
  });
  it("reuses a customer the business already has", async () => {
    fakeStripe();
    await startTrialCheckout({
      tenantId: TENANT,
      plan: "managed",
      email: "a@b.co",
      customer: "cus_old",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.form.get("customer")).toBe("cus_old");
    expect(calls[0]!.form.get("metadata[plan]")).toBe("managed");
  });
});

describe("startTrialFromSession", () => {
  it("reads the saved card and creates the subscription once per session", async () => {
    fakeStripe();
    const r = await startTrialFromSession(session(), "2026-11-20");
    expect(r?.ok).toBe(true);
    const sub = calls.find((c) => c.url.endsWith("/v1/subscriptions"))!;
    expect(sub.method).toBe("POST");
    expect(sub.headers["Idempotency-Key"]).toBe("repsuites-trial-cs_test_setup1");
    expect(Object.fromEntries(sub.form)).toEqual({
      customer: "cus_test1",
      "items[0][quantity]": "1",
      "items[0][price_data][currency]": "gbp",
      "items[0][price_data][product]": "repsuites_growth",
      "items[0][price_data][unit_amount]": "4900",
      "items[0][price_data][recurring][interval]": "month",
      default_payment_method: "pm_test1",
      trial_end: String(Date.parse("2026-12-04T09:00:00Z") / 1000),
      billing_cycle_anchor: String(Date.parse("2027-01-01T09:00:00Z") / 1000),
      proration_behavior: "create_prorations",
      "metadata[kind]": "plan",
      "metadata[product]": "repsuites",
      "metadata[tenant_id]": TENANT,
      "metadata[plan]": "gold",
      "metadata[checkout_session]": "cs_test_setup1",
    });
  });
  it("makes the product the first time", async () => {
    fakeStripe({
      "products/repsuites_growth": () => [404, { error: { message: "No such product" } }],
    });
    await startTrialFromSession(session(), "2026-11-20");
    const create = calls.find((c) => c.url.endsWith("/v1/products"))!;
    expect(create.form.get("id")).toBe("repsuites_growth");
    expect(create.form.get("name")).toBe("RepSuites Growth");
  });
  it("ignores other sessions", async () => {
    fakeStripe();
    expect(await startTrialFromSession(session({ mode: "subscription" }))).toBeNull();
    expect(
      await startTrialFromSession(
        session({
          metadata: {
            kind: "plan",
            product: "sparkops",
            tenant_id: TENANT,
            plan: "gold",
            trial: "1",
          },
        }),
      ),
    ).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("Stripe webhook with a trial", () => {
  it("checkout.session.completed (setup) starts the trial and unlocks the paid plan", async () => {
    fakeStripe();
    const { raw, sig } = signed({
      id: "evt_setup1",
      type: "checkout.session.completed",
      created: 1795000000,
      data: { object: session() },
    });
    expect(await handleStripeWebhook(raw, sig)).toBe(200);
    expect(calls.some((c) => c.url.endsWith("/v1/subscriptions"))).toBe(true);
    const billing = db.writes.find((w) => w.endpoint.startsWith("tenant_billing"))!;
    expect(billing.options.body).toMatchObject({
      tenant_id: TENANT,
      stripe_customer_id: "cus_test1",
      stripe_subscription_id: "sub_test1",
      plan: "gold",
      status: "trialing",
    });
    const plan = db.writes.find((w) => w.endpoint.startsWith("tenant_plans"))!;
    expect(plan.options.body).toEqual({
      tenant_id: TENANT,
      plan: "gold",
      features: ["ranking", "ai_visibility", "nfc", "growth"],
    });
  });
  it("does not start a second trial for a business already on a plan", async () => {
    fakeStripe();
    db.billing = [{ status: "trialing" }];
    const { raw, sig } = signed({
      id: "evt_setup2",
      type: "checkout.session.completed",
      data: { object: session() },
    });
    expect(await handleStripeWebhook(raw, sig)).toBe(200);
    expect(calls.some((c) => c.url.endsWith("/v1/subscriptions"))).toBe(false);
  });
  it("if Stripe fails, answers 500 and forgets the event so Stripe's retry runs it again", async () => {
    fakeStripe({ subscriptions: () => [402, { error: { message: "Your card was declined." } }] });
    const { raw, sig } = signed({
      id: "evt_setup3",
      type: "checkout.session.completed",
      data: { object: session() },
    });
    expect(await handleStripeWebhook(raw, sig)).toBe(500);
    const del = db.writes.find((w) => w.options.method === "DELETE")!;
    expect(del.endpoint).toBe("stripe_events?id=eq.evt_setup3");
    expect(db.writes.some((w) => w.endpoint.startsWith("tenant_plans"))).toBe(false);
  });
  it("customer.subscription.created (trialing) keeps the plan on and tells HQ trial_started", async () => {
    fakeStripe();
    process.env["HQ_CRM_SECRET"] = "hq_test_not_real";
    const { raw, sig } = signed({
      id: "evt_created1",
      type: "customer.subscription.created",
      created: 1795000000,
      data: {
        object: {
          id: "sub_test1",
          object: "subscription",
          customer: "cus_test1",
          status: "trialing",
          items: {
            data: [{ current_period_end: 1796374800, price: { unit_amount: 4900 }, quantity: 1 }],
          },
          metadata: { kind: "plan", product: "repsuites", tenant_id: TENANT, plan: "gold" },
        },
      },
    });
    expect(await handleStripeWebhook(raw, sig)).toBe(200);
    const plan = db.writes.find((w) => w.endpoint.startsWith("tenant_plans"))!;
    expect(plan.options.body.plan).toBe("gold");
    const hq = calls.find((c) => !c.url.startsWith("https://api.stripe.com"))!;
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls.find((c) => c[0] === hq.url)![1] as any).body,
    );
    expect(body).toMatchObject({
      source: "repsuites",
      event: "trial_started",
      idempotency_key: "stripe:evt_created1",
      value_pence: 4900,
      product_link: { product: "repsuites", type: "tenant", id: TENANT },
    });
  });
});

import { trialSubmitText } from "./trial.server";
describe("card page wording", () => {
  it("shows the trial end, first payment date and amount before the card", () => {
    const t = trialSubmitText("gold", "2026-11-20");
    expect(t).toContain("Free until 4 December 2026");
    expect(t).toContain("First payment £44.26 on 4 December 2026");
    expect(t).toContain("£49 on the 1st of each month from 1 January 2027");
    expect(t.length).toBeLessThanOrEqual(1200);
  });
});
