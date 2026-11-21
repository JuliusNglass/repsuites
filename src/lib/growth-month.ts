// "Pick your start month" for growth leads who aren't ready yet.
// They choose a month; two weeks before it, they get a text with the booking link.

/** Next 6 months as YYYY-MM, starting next month. */
export function monthChoices(now: Date): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export const MONTH_RE = /^20\d\d-(0[1-9]|1[0-2])$/;

export function validMonth(m: string, now: Date): boolean {
  return MONTH_RE.test(m) && monthChoices(now).includes(m);
}

/** Tag that stores the chosen month. */
export const monthTag = (m: string) => `start-${m}`;

/** True from 14 days before the 1st of the month onwards. */
export function reminderDue(m: string, now: Date): boolean {
  if (!MONTH_RE.test(m)) return false;
  const [y = 0, mo = 1] = m.split("-").map(Number);
  const start = Date.UTC(y, mo - 1, 1);
  return now.getTime() >= start - 14 * 86_400_000;
}

export function monthName(m: string): string {
  const [y = 0, mo = 1] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function startSms(first: string | null | undefined, m: string, link: string): string {
  const hi = first ? `Hi ${first.split(/\s+/)[0]}` : "Hi";
  return `${hi}, you said you'd like to start in ${monthName(m)}. Here's the link to pick a time for your call: ${link} Accelur8`;
}
