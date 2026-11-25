// Google Fix-it Pack for Nigerian business owners (/ng). Pure data shared by
// the page, checkout and tests. Prices are in kobo (₦1 = 100 kobo).
// Price test: ₦10,000 vs ₦20,000 for the Do-it-yourself pack. Done-for-you
// is the pack plus us putting it in, a fixed amount on top.
// No em dashes in this copy (AGENTS.md).

export type NgPrice = 10 | 20;
export type NgTier = "diy" | "dfy";

export const NG_DIY_KOBO: Record<NgPrice, number> = { 10: 1_000_000, 20: 2_000_000 };
export const NG_DFY_EXTRA_KOBO = 1_500_000; // +₦15,000 for "we put it in for you"

export function ngAmountKobo(price: NgPrice, tier: NgTier): number {
  return NG_DIY_KOBO[price] + (tier === "dfy" ? NG_DFY_EXTRA_KOBO : 0);
}

export function naira(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}

/** "about ₦28 a day" over a year: smaller than a sachet of pure water. */
export function nairaPerDay(kobo: number, days = 365): string {
  return `about ₦${Math.ceil(kobo / 100 / days)} a day`;
}

/** Which test price a visitor sees: ?p=10 / ?p=20 from the ad, else random, kept. */
export function pickNgPrice(fromUrl?: unknown): NgPrice {
  if (fromUrl === 10 || fromUrl === "10") return 10;
  if (fromUrl === 20 || fromUrl === "20") return 20;
  return Math.random() < 0.5 ? 10 : 20;
}

export const NG_INCLUDES = [
  "A new Google business description, using the exact words your customers type",
  "The right main and extra categories, so Google knows what you sell",
  "All your products or services listed with short descriptions",
  "4 ready-to-post Google updates written for your business",
  "Reply templates for good and bad reviews",
  "A simple step-by-step list. Copy, paste, done",
];

/** The teaching blocks: what most owners were never told. */
export const NG_LESSONS: { title: string; body: string }[] = [
  {
    title: "1. Customers search before they call",
    body: 'People type things like "tailor near me" or "best pharmacy in Ikeja" into Google. Google shows a map with 3 businesses. Those 3 get most of the calls.',
  },
  {
    title: "2. Google only shows what it understands",
    body: "Google reads your free Business Profile: your category, description, services, photos and reviews. If it is empty or wrong, Google skips you, even if you are the best in your area.",
  },
  {
    title: "3. ChatGPT and Google AI read the same thing",
    body: 'When someone asks ChatGPT or Google AI "who is good for this near me", the answer comes from what is written about you online. Clear words on your profile help you get named.',
  },
  {
    title: "4. Most owners have never checked",
    body: "Search your own business type and area on your phone now. If you are not in the top 3 on the map, customers are going to someone else.",
  },
];

export const NG_FAQ: [string, string][] = [
  [
    "How fast do I get it?",
    "In minutes, on WhatsApp and email, straight after you pay. You only tell us which business it is.",
  ],
  [
    "Do I need to be good with computers?",
    "No. Everything is written for you. You copy and paste it into Google from your phone. Most people finish in 20 minutes.",
  ],
  [
    "What if I do not have a Google Business Profile yet?",
    "The steps show you how to create one for free, then what to put in it.",
  ],
  [
    "What does Done for you mean?",
    "You add us as a manager on your Google profile (we show you how, no password needed) and we put everything in for you.",
  ],
  [
    "Will this put me at number 1?",
    "Nobody honest can promise that. It gives Google what it needs to understand and show your business, which most owners are missing.",
  ],
  ["How do I pay?", "Card, bank transfer or USSD, through Paystack. One payment. No subscription."],
];
