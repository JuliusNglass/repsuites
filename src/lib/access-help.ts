// Pure helpers for "Access help": getting Accelur8 added as a manager on a
// business's Google profile. Client-safe. No em dashes in this copy.

export type AccessStatus = "not_started" | "request_sent" | "waiting" | "video_booked" | "done";

export const ACCESS_STATUSES: { id: AccessStatus; label: string }[] = [
  { id: "not_started", label: "Not started" },
  { id: "request_sent", label: "Request sent to Google" },
  { id: "waiting", label: "Waiting for a reply" },
  { id: "video_booked", label: "Video check booked" },
  { id: "done", label: "Done: we are a manager" },
];

export function isAccessStatus(s: string): s is AccessStatus {
  return ACCESS_STATUSES.some((x) => x.id === s);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// When to chase. Worked example: request sent on 1 Nov. Chase on 4 Nov
// (3 days later). If 4 Nov has passed, chase on 8 Nov (7 days after the
// request), when Google usually lets the owner claim it themselves.
export function chaseOn(
  status: AccessStatus,
  requestedOn: string | null,
  today: string,
): string | null {
  if (!requestedOn || !/^\d{4}-\d{2}-\d{2}$/.test(requestedOn)) return null;
  if (status !== "request_sent" && status !== "waiting") return null;
  const first = addDays(requestedOn, 3);
  return today <= first ? first : addDays(requestedOn, 7);
}
