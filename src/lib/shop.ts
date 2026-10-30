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

export type PaidPlan = "starter" | "pro" | "gold";

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

export const FREE_FEATURES = [
  "Your own review page",
  "QR codes to print for tables, counters and receipts",
  "Unhappy customers message you privately, not on Google",
  "Connect Google and see your real numbers: views, calls and directions",
];

export function planPence(interval: BillingInterval): number {
  return interval === "year" ? GROWTH.yearPence : GROWTH.monthPence;
}

// How much a year saves against paying monthly.
// Worked example: £49 x 12 = £588. £588 - £497 = £91 saved.
export function yearSaving(): number {
  return GROWTH.monthPence * 12 - GROWTH.yearPence;
}

export const PLAN_FEATURES: Record<PaidPlan, string[]> = {
  starter: ["growth"],
  pro: ["ranking", "growth"],
  gold: ["ranking", "ai_visibility", "nfc", "growth"],
};

// Daily cost in plain words: £99 a month is about £3.25 a day (99 x 12 / 365).
export function perDay(pence: number): string {
  return money(Math.round((pence * 12) / 365));
}
