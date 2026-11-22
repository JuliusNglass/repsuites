// Fit Call join tracking. Pure, safe to unit test.
// Texts carry https://repsuites.com/api/join?c=<contact>; tapping it records the join
// and opens the Google Meet. Anyone who hasn't tapped it 3 minutes after the start gets one nudge.

export const FIT_CALL_CALENDAR = "UF7kR5ualJxUlkGHaF3L";
export const NUDGE_AFTER_MIN = 3;
export const NUDGE_UNTIL_MIN = 15;

export function joinLink(contactId: string): string {
  return `https://repsuites.com/api/join?c=${encodeURIComponent(contactId)}`;
}

/** True between 3 and 15 minutes after the call was due to start. */
export function nudgeDue(startIso: string, now: Date): boolean {
  const t = new Date(startIso).getTime();
  if (!Number.isFinite(t)) return false;
  const mins = (now.getTime() - t) / 60_000;
  return mins >= NUDGE_AFTER_MIN && mins <= NUDGE_UNTIL_MIN;
}

/** Only real Google Meet links are opened. */
export function safeMeet(url: string | null | undefined): string | null {
  return /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i.test((url ?? "").trim())
    ? (url ?? "").trim()
    : null;
}

/** The booking to join: the one nearest now, from 1 hour before to 1 hour after its start. */
export function pickAppointment<
  T extends { startTime?: string; deleted?: boolean; calendarId?: string },
>(events: T[], now: Date): T | null {
  let best: T | null = null;
  let gap = Infinity;
  for (const e of events) {
    if (e.deleted || e.calendarId !== FIT_CALL_CALENDAR || !e.startTime) continue;
    const d = Math.abs(
      new Date(
        e.startTime.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(e.startTime) ? "" : "Z"),
      ).getTime() - now.getTime(),
    );
    if (d <= 3_600_000 && d < gap) {
      best = e;
      gap = d;
    }
  }
  return best;
}

function first(name?: string | null): string {
  const f = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : "there";
}

export function nudgeSms(firstName: string | null | undefined, link: string): string {
  return `Hi ${first(firstName)}, we're on the call now and ready when you are: ${link} Accelur8`;
}
