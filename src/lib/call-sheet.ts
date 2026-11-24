// Call sheet maths (Commercial Launch). Pure, no server imports.
export const LAUNCH_PRICE = 2000;
export const SPARKOPS_MONTHLY = 97;
export const SPARKOPS_MONTHS_YEAR_ONE = 9; // first 3 months included
export const YEAR_ONE_COST = LAUNCH_PRICE + SPARKOPS_MONTHLY * SPARKOPS_MONTHS_YEAR_ONE; // 2873

/** Yearly profit from one contract: weekly value x margin x 52. */
export function yearlyProfit(weekly: number, marginPct: number): number {
  if (!(weekly > 0) || !(marginPct > 0)) return 0;
  return Math.round(weekly * (marginPct / 100) * 52);
}

/** Contracts needed to cover year-one cost, to 1 decimal place. */
export function breakEvenContracts(weekly: number, marginPct: number): number | null {
  const p = yearlyProfit(weekly, marginPct);
  if (!p) return null;
  return Math.round((YEAR_ONE_COST / p) * 10) / 10;
}

/**
 * Contracts needed to cover the £2,000 launch if each contract lasts `weeks`
 * (13 = 3 months, 26 = 6 months), counting only what they keep. 1 decimal place.
 */
export function contractsToCover(weekly: number, marginPct: number, weeks: number): number | null {
  if (!(weekly > 0) || !(marginPct > 0) || !(weeks > 0)) return null;
  const kept = weekly * (marginPct / 100) * weeks;
  return Math.round((LAUNCH_PRICE / kept) * 10) / 10;
}

/** A starter office contract from a domestic hourly rate: 2 hours, 3 times a week. */
export const STARTER_OFFICE_HOURS = 6;

export function perDay(amount: number): number {
  return Math.round((amount / 365) * 100) / 100;
}

export const OUTCOMES = [
  "Paid in full",
  "Payment plan",
  "Thinking",
  "Not a fit",
  "No show",
] as const;
export const OBJECTIONS = [
  "None",
  "Partner",
  "Think about it",
  "Price",
  "Time",
  "Lead guarantee",
  "Other",
] as const;

export const FIELDS = {
  margin: "U1gS5OIDz8h4uQRoMgvs",
  weekly: "PKhBnImlLN3kjNQOCyef",
  commercialNow: "ylMpaeGKD8Mrtww73Ay3",
  blocker: "KIg5gzqcZ081okQckgJp",
  decisionMaker: "Sb91PNLOG6fs3D2wFEBf",
  outcome: "eT8Ayytu3NldiTRTufRS",
  objection: "nQoB55dh1BPYCDe1TwrE",
  breakEven: "R4GU2PlxD3OOwp4nP5Be",
  recording: "RdEktecgvLjdA1SPODAe",
  howWin: "RQqoOMtycE4KbUSDd7f6",
} as const;

/** Objection handling: say this, then pivot back to the close. {be} = contracts lasting 6 months that cover the £2,000, {name} = first name. */
export const OBJECTION_SCRIPTS: Record<string, { handle: string; pivot: string }> = {
  Partner: {
    handle:
      "Makes sense, it's a big decision. Can I ask, if it was only you deciding, would you go ahead today? ... What do you think they will ask? Let's answer that now so you have it. Could we get them on for 5 minutes now, or book 10 minutes together tomorrow?",
    pivot:
      "If they're happy with the numbers we just went through, which suits you both better: £2,000 in one go, or 3 payments of £700?",
  },
  "Think about it": {
    handle:
      "Totally fair. So I can help, what exactly do you want to think over: the money, the timing, or whether it will work for you? ... (Answer that one thing only, using their numbers.)",
    pivot:
      "Now that's answered, is there anything else stopping you? ... Great, shall I send the link for in full or the 3 payments?",
  },
  Price: {
    handle:
      "I understand. Let's look at it with your numbers. With your numbers, about {be} office contracts lasting 6 months cover it. The 3 months is about £22 a day, roughly what you pay a cleaner for one hour. Every contract after that is money in your pocket.",
    pivot:
      "Would 3 payments of £700 make it easier to start now, so the first contracts are paying for it as you go?",
  },
  Time: {
    handle:
      "That's exactly why it's built this way. We run the ads, the page and the follow-up texts. Your part is quoting and visiting the offices that ask, about an hour a week to start.",
    pivot:
      "If an hour a week brings in {be} contracts, is that worth it? ... Great, in full or 3 payments?",
  },
  "Lead guarantee": {
    handle:
      "We never guarantee a number of leads, nobody honest can. We guarantee the work: the ads, the page, the follow-ups and the quoting system. You only need about {be} contracts lasting 6 months to cover it.",
    pivot:
      "How many do you think you could win if we put you in front of the right offices? ... So {be} feels doable? Then let's get you started. In full or 3 payments?",
  },
  "Not ready yet": {
    handle:
      "What would need to change for you to be ready? ... The ads take a few weeks to bring in your first offices, so starting later means contracts start later too. Waiting doesn't make it cheaper, it only pushes the income back.",
    pivot:
      "If we start now, your first office could be paying you before {month}. Shall we lock in your start: in full or 3 payments?",
  },
  "Tried ads before": {
    handle:
      "What happened last time? ... Usually it's no fast follow-up, the wrong offer or the wrong type of business. This is commercial only, with texts going out within minutes and a page built to win office contracts.",
    pivot:
      "If that part is handled for you, is there anything else stopping you? ... In full or 3 payments?",
  },
};
