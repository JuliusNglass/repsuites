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
