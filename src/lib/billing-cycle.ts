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
