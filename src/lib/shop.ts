// What RepSuites sells, and for how much. Client-safe: the shop pages and the
// server both read prices from here, and the server never trusts a price sent
// from the browser. No em dashes in this copy (AGENTS.md).

export type Pack = { id: string; qty: number; pence: number; badge?: string };

export const CARD_PACKS: Pack[] = [
  { id: "cards-1", qty: 1, pence: 1500 },
  { id: "cards-3", qty: 3, pence: 3500, badge: "Most popular" },
  { id: "cards-5", qty: 5, pence: 5000 },
  { id: "cards-10", qty: 10, pence: 8000, badge: "Best value" },
];

export const STAND_PACKS: Pack[] = [
  { id: "stand-1", qty: 1, pence: 2900 },
  { id: "stand-2", qty: 2, pence: 4900, badge: "Save £9" },
];

export const findCardPack = (id: string | null | undefined) =>
  CARD_PACKS.find((p) => p.id === id) ?? null;
export const findStandPack = (id: string | null | undefined) =>
  STAND_PACKS.find((p) => p.id === id) ?? null;

export function money(pence: number): string {
  return pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`;
}

// Price of one item in a pack, rounded to the penny, for "£11.67 each".
export function each(p: Pack): string {
  return money(Math.round(p.pence / p.qty));
}

export type PaidPlan = "starter" | "pro" | "gold" | "managed";

export type BillingInterval = "month" | "year";

// One paid plan: RepSuites Growth. Internal id "gold" (older plan ids are
// still understood for anyone who subscribed before).
export const GROWTH = {
  id: "gold" as const,
  name: "RepSuites Growth",
  monthPence: 4900,
  yearPence: 49700,
  tagline: "Everything you need to get more reviews and more customers.",
  features: [
    "AI writes a reply to every Google review for you",
    "Ask customers for reviews by email, WhatsApp or text",
    "A plain-English summary of what customers say, every month",
    "See where you show up on Google Maps across your area",
    "Check if AI assistants like ChatGPT recommend you",
    "Post updates to your Google profile",
    "A monthly report by email",
  ],
};

// "We do it for you": Growth plus Accelur8 running it. Internal id "managed".
export const MANAGED = {
  id: "managed" as const,
  name: "RepSuites: We do it for you",
  monthPence: 9900,
  yearPence: 99700,
  tagline: "Too busy? We run it for you. You just hand out the QR code.",
  features: [
    "Everything in Growth",
    "We approve your AI review replies, so every review gets an answer",
    "We plan and approve your Google posts each month",
    "We send your review requests for you",
    "We keep your Google profile tidy and up to date",
    "A monthly check-in call or message with your numbers",
  ],
};

export type CheckoutPlan = "gold" | "managed";

// Monthly plans start with a 14-day free trial (card taken at the start, no
// setup fee). Yearly plans have no trial. The sums are in billing-cycle.ts.
export const TRIAL_TERMS =
  "14-day free trial, then billed on the 1st of each month (the first payment covers only the rest of that month).";

export const FREE_FEATURES = [
  "Your own review page",
  "QR codes to print for tables, counters and receipts",
  "Unhappy customers message you privately, not on Google",
  "Connect Google and see your real numbers: views, calls and directions",
];

export function planPence(interval: BillingInterval, plan: CheckoutPlan = "gold"): number {
  const p = plan === "managed" ? MANAGED : GROWTH;
  return interval === "year" ? p.yearPence : p.monthPence;
}

// How much a year saves against paying monthly.
// Worked example: £49 x 12 = £588. £588 - £497 = £91 saved.
export function yearSaving(plan: CheckoutPlan = "gold"): number {
  const p = plan === "managed" ? MANAGED : GROWTH;
  return p.monthPence * 12 - p.yearPence;
}

export const PLAN_FEATURES: Record<PaidPlan, string[]> = {
  starter: ["growth"],
  pro: ["ranking", "growth"],
  gold: ["ranking", "ai_visibility", "nfc", "growth"],
  managed: ["ranking", "ai_visibility", "nfc", "growth", "managed"],
};

// Daily cost in plain words: £99 a month is about £3.25 a day (99 x 12 / 365).
export function perDay(pence: number): string {
  return money(Math.round((pence * 12) / 365));
}
