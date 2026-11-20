/* eslint-disable @typescript-eslint/no-explicit-any -- reading the Stripe body shape. */
import { describe, expect, it } from "vitest";
import {
  TRIAL_ENTRY_PENCE,
  TRIAL_MONTH_PENCE,
  trialChannel,
  trialCustomerProblem,
  trialPreview,
  trialSender,
  TRIAL_DATA_PROMISE,
  TRIAL_TERMS,
} from "./review-trial";
import { reviewTrialCheckoutBody } from "./review-trial.server";

describe("review trial rules", () => {
  it("needs a name and a way to reach them", () => {
    expect(trialCustomerProblem({ name: "", phone: "07700900123", email: "" })).toMatch(/name/);
    expect(trialCustomerProblem({ name: "Sam", phone: "", email: "" })).toMatch(/mobile or email/);
    expect(trialCustomerProblem({ name: "Sam", phone: "12345", email: "" })).toMatch(/mobile/);
    expect(trialCustomerProblem({ name: "Sam", phone: "", email: "nope" })).toMatch(/email/);
    expect(trialCustomerProblem({ name: "Sam", phone: "07700 900123", email: "" })).toBeNull();
    expect(trialCustomerProblem({ name: "Sam", phone: "", email: "sam@x.co.uk" })).toBeNull();
  });

  it("texts when there is a mobile, otherwise emails", () => {
    expect(trialChannel({ name: "A", phone: "07700900123", email: "a@b.co" })).toBe("sms");
    expect(trialChannel({ name: "A", phone: "", email: "a@b.co" })).toBe("email");
  });

  it("previews a text in the business name with an opt-out", () => {
    const t = trialPreview("Sam Jones", "Bright Clean");
    expect(t).toContain("Sam");
    expect(t).toContain("Bright Clean");
    expect(t).toMatch(/Stop:/);
  });

  it("makes a valid sender name", () => {
    expect(trialSender("Bright & Shiny Cleaning Ltd")).toMatch(/^[A-Za-z][A-Za-z0-9 ]{2,10}$/);
    expect(trialSender("12")).toBe("RepSuites");
  });

  it("copy has no em dashes", () => {
    expect(TRIAL_TERMS + TRIAL_DATA_PROMISE).not.toMatch(/—/);
  });
});

describe("review trial checkout", () => {
  it("is a 30 day trial at £49 with £1 today", () => {
    const b: any = reviewTrialCheckoutBody({ token: "", business: "X", email: "" });
    expect(b.mode).toBe("subscription");
    expect(b.subscription_data.trial_period_days).toBe(30);
    expect(b.line_items[0].price_data.unit_amount).toBe(TRIAL_MONTH_PENCE);
    expect(b.line_items[0].price_data.recurring.interval).toBe("month");
    expect(b.line_items[1].price_data.unit_amount).toBe(TRIAL_ENTRY_PENCE);
    expect(b.metadata.kind).toBe("review_trial");
    expect(b.success_url).toContain("/try/next?s={CHECKOUT_SESSION_ID}");
  });
});
