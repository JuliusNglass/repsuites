// The Fix-It Pack: a one-off £27 done-for-you write-up of the Google profile
// fixes a free check found. Pure data, shared by the sales page, the report
// card and the checkout. No em dashes in this copy (AGENTS.md).
export const FIXIT_PENCE = 2700;
export const FIXIT_PRICE = "£27";

export const FIXIT_INCLUDES = [
  "A rewritten Google business description, using the words people search for",
  "The right main and extra categories for what you actually do",
  "Your services listed properly, with short descriptions",
  "4 ready-to-post Google updates, written for your business",
  "Replies written for your last 10 unanswered reviews",
  "A plain-English checklist of the exact fixes, in order",
];

export const FIXIT_FAQ: [string, string][] = [
  ["How fast do I get it?", "Within 48 hours (working days). We send it by email and WhatsApp."],
  [
    "Do I need to give you my Google login?",
    "No. We write everything for you to copy in. If you would rather we put it in for you, we can show you how to add us safely as a manager.",
  ],
  [
    "What if I am not happy?",
    "Tell us within 14 days and we will either rewrite it or refund you in full. No forms, just reply to our message.",
  ],
  ["Is this a subscription?", "No. It is a one-off payment of £27. Nothing else is taken."],
];

/** Report tokens are 20 to 64 URL-safe characters. */
export function cleanToken(t: unknown): string | null {
  const s = String(t ?? "");
  return /^[A-Za-z0-9_-]{20,64}$/.test(s) ? s : null;
}
