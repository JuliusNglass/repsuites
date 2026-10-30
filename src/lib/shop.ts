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

export const PLAN_OFFERS: {
  id: PaidPlan;
  name: string;
  pence: number;
  tagline: string;
  popular?: boolean;
  features: string[];
}[] = [
  {
    id: "starter",
    name: "Starter",
    pence: 4900,
    tagline: "Win more reviews and answer every one.",
    features: [
      "Google reviews inbox with suggested replies",
      "Review page behind every QR code and NFC card",
      "Your choice of review sites: Google, Facebook, Tripadvisor and more",
      "Private feedback straight to your inbox",
      "Print-ready QR coasters and table stands",
      "Monthly report by email",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    pence: 9900,
    tagline: "Climb into the top 3 on Google Maps.",
    popular: true,
    features: [
      "Everything in Starter",
      "Google Maps ranking grid across your area",
      "Automatic or suggested replies to new reviews",
      "Google posts from your dashboard",
      "Calls, directions and website clicks tracked",
    ],
  },
  {
    id: "gold",
    name: "Gold",
    pence: 19900,
    tagline: "We do the work for you.",
    features: [
      "Everything in Pro",
      "AI search checks: are ChatGPT, Gemini and others naming you?",
      "We reply to reviews and post updates for you",
      "3 NFC review cards included",
      "Priority support",
    ],
  },
];

export const PLAN_FEATURES: Record<PaidPlan, string[]> = {
  starter: [],
  pro: ["ranking"],
  gold: ["ranking", "ai_visibility", "nfc"],
};

// Daily cost in plain words: £99 a month is about £3.25 a day (99 x 12 / 365).
export function perDay(pence: number): string {
  return money(Math.round((pence * 12) / 365));
}
