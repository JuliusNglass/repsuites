// Monthly plans are paid on the 1st of each month. Someone who joins
// mid-month pays for the days left in this month now (Stripe works out the
// share), then the full price on the 1st. Client-safe. No em dashes.

export function londonToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

// The 1st of the month after a date's month.
export function firstAfter(date: string): string {
  const d = new Date(`${date.slice(0, 8)}01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// 9am UK time on a date, as a Unix time.
export function nineAmLondon(date: string): number {
  for (const off of [0, 1]) {
    const t = Date.parse(`${date}T${String(9 - off).padStart(2, "0")}:00:00Z`) / 1000;
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(t * 1000));
    if (hour === "09") return t;
  }
  return Date.parse(`${date}T09:00:00Z`) / 1000;
}

// Extra subscription settings for a monthly Checkout: none on the 1st (the
// full price now), otherwise anchor on the next 1st with a part-month charge.
export function monthlyAnchor(today: string): Record<string, unknown> {
  if (today.endsWith("-01")) return {};
  return {
    billing_cycle_anchor: nineAmLondon(firstAfter(today)),
    proration_behavior: "create_prorations",
  };
}

// ---------- 14-day free trial (monthly plans) ----------
// The trial runs its full 14 days from sign-up. The first payment covers only
// the days left in that month after the trial ends, then the full price on the
// 1st of each month. Worked example: trial from 20 Nov ends 4 Dec. 4 to 31 Dec
// is 28 days of December's 31, so £49 x 28 / 31 = £44.26 on 4 Dec, then £49
// on 1 Jan.

export const TRIAL_DAYS = 14;

// A date plus some days ("2026-11-20" + 14 = "2026-12-04").
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// How many days the date's month has (December: 31).
export function daysInMonth(date: string): number {
  const first = `${date.slice(0, 8)}01`;
  return Math.round((Date.parse(firstAfter(date)) - Date.parse(first)) / 86_400_000);
}

export interface TrialPlan {
  trialEnds: string; // the day the trial ends and the first payment is taken
  trialEnd: number; // 9am UK time on that day, as a Unix time (Stripe trial_end)
  anchor: number | null; // 9am UK on the next 1st (Stripe billing_cycle_anchor), null if the trial ends on a 1st
  firstPaymentDays: number; // days the first payment covers (28)
  monthDays: number; // days in that month (31)
  firstPence: number; // the first payment (4426 = £44.26)
  fullFrom: string; // the 1st when the full price starts ("2027-01-01")
}

// The trial and first payment for someone who signs up today. Stripe works
// out the real part-month charge; this is the same sum, for showing and tests.
export function monthlyTrial(today: string, monthPence: number): TrialPlan {
  const trialEnds = addDays(today, TRIAL_DAYS);
  const monthDays = daysInMonth(trialEnds);
  const onFirst = trialEnds.endsWith("-01");
  const firstPaymentDays = monthDays - Number(trialEnds.slice(8, 10)) + 1;
  return {
    trialEnds,
    trialEnd: nineAmLondon(trialEnds),
    anchor: onFirst ? null : nineAmLondon(firstAfter(trialEnds)),
    firstPaymentDays,
    monthDays,
    firstPence: Math.round((monthPence * firstPaymentDays) / monthDays),
    fullFrom: onFirst ? trialEnds : firstAfter(trialEnds),
  };
}
