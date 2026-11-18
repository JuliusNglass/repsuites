// The Fix-It Pack: a one-off £49 done-for-you write-up of the Google profile
// fixes a free check found. Pure data, shared by the sales page, the report
// card and the checkout. No em dashes in this copy (AGENTS.md).
export const FIXIT_PENCE = 4900;
export const FIXIT_PRICE = "£49";

export const FIXIT_INCLUDES = [
  "A rewritten Google business description, using the words people search for",
  "The right main and extra categories for what you actually do",
  "Your services listed properly, with short descriptions",
  "4 ready-to-post Google updates, written for your business",
  "Review reply templates that show you how to use your keywords in every reply",
  "A plain-English checklist of the exact fixes, in order",
];

export const FIXIT_FAQ: [string, string][] = [
  [
    "How fast do I get it?",
    "In minutes. It appears on screen straight after you pay, and we email you a copy.",
  ],
  [
    "Do I need to give you my Google login?",
    "No. We write everything for you to copy in. If you would rather we put it in for you, we can show you how to add us safely as a manager.",
  ],
  [
    "What if I am not happy?",
    "Tell us within 14 days and we will rewrite it for you. No forms, just reply to our email.",
  ],
  [
    "Will this move me up on Google?",
    "It gets your profile right, which is the foundation. On its own that is a good start, but it rarely moves you up much. Google favours profiles that stay active: fresh reviews, replies and updates, month after month. That is what RepSuites Growth keeps going, and your first month of it is free with this pack.",
  ],
  [
    "Is this a subscription?",
    "No. The pack is a one-off payment of £49. Nothing else is taken. Growth is optional: after your free month you choose to keep it or not, and you can cancel any time.",
  ],
];

/** Report tokens are 20 to 64 URL-safe characters. */
export function cleanToken(t: unknown): string | null {
  const s = String(t ?? "");
  return /^[A-Za-z0-9_-]{20,64}$/.test(s) ? s : null;
}

// The £49 Profile Fix Pack (/profile): the same pack, sold cold from ads.
// After paying, buyers are offered one tap to have it put in for them (£22,
// with the first managed month free), then a plan for after that month.
export const PACK27_PENCE = 4900;
export const PACK27_PRICE = "£49";
export const INSTALL_PENCE = 2200;
export const INSTALL_PRICE = "£22";
export const FREE_MONTH_DAYS = 30;

export const PACK27_INCLUDES = [
  "Every service you offer, listed with short descriptions",
  "The right main and extra Google categories for what you do",
  "A new business description naming the areas you cover",
  "Review reply templates that show you how to use your keywords",
  "4 ready-to-post Google updates, written for your business",
  "A plain-English checklist, in order, so you can paste it in fast",
];

export const PACK27_FAQ: [string, string][] = [
  ["How fast do I get it?", "Within 30 minutes, on WhatsApp and email. Most arrive much sooner."],
  [
    "Do I need tech skills or a call?",
    "No. Everything is written for you to copy and paste. Most owners finish in about 5 to 20 minutes. No calls.",
  ],
  [
    "Do I need to give you my Google login?",
    "No. You paste it in yourself. If you would rather we did it, you can add that after you pay.",
  ],
  [
    "Will this get me into the top 3 on Google?",
    "Nobody can promise that. It gives you the foundation Google looks for, so you have the best chance of showing up across the areas you cover.",
  ],
  [
    "Is this a subscription?",
    "No. £49 once. Nothing else is taken unless you choose an extra on the next page.",
  ],
  ["What if I am not happy?", "Tell us within 14 days and we will rewrite it or refund you."],
];

/** Pence per day over a year, shown as "about 13p a day". */
export function perDay(pence: number, days = 365): string {
  const p = pence / days;
  return p < 100
    ? `about ${Math.max(1, Math.round(p))}p a day`
    : `about £${(p / 100).toFixed(2)} a day`;
}
