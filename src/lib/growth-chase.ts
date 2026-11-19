// Growth page: qualified owners who did not book a Fit Call get up to three
// short texts with their booking link. Pure logic (unit tested); sending lives
// in growth-chase.server.ts.

export type ChaseStep = 1 | 2 | 3;

// 10 minutes, next day, day 3.
export const CHASE: { step: ChaseStep; afterMinutes: number }[] = [
  { step: 1, afterMinutes: 10 },
  { step: 2, afterMinutes: 20 * 60 },
  { step: 3, afterMinutes: 68 * 60 },
];

// Leads older than this never start or continue the chase.
export const CHASE_MAX_HOURS = 96;
// Leads from before the chase went live were followed up by hand.
export const CHASE_START = "2026-11-19T00:00:00Z";

export const CHASE_STOP_TAGS = [
  "grw-booked",
  "replied",
  "customer",
  "no-followup",
  "grw-nobook",
  "free-check",
];

export function chaseDue(createdAt: string, done: number[], now: Date): ChaseStep | null {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t) || t < new Date(CHASE_START).getTime()) return null;
  const ageMin = (now.getTime() - t) / 60_000;
  if (ageMin < 0 || ageMin > CHASE_MAX_HOURS * 60) return null;
  const next = CHASE.find((c) => !done.includes(c.step));
  if (!next || ageMin < next.afterMinutes) return null;
  return next.step;
}

export function bookLink(c: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const q = new URLSearchParams();
  if (c.firstName) q.set("first_name", c.firstName);
  if (c.lastName) q.set("last_name", c.lastName);
  if (c.email) q.set("email", c.email);
  if (c.phone) q.set("phone", c.phone);
  return `https://growth.accelur8clientwork.com/book?${q}`;
}

function first(name?: string | null): string {
  const f = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : "there";
}

// About them, short, no opt-out line (the first text in the sequence has it).
export function chaseSms(
  step: ChaseStep,
  firstName: string | null | undefined,
  link: string,
): string {
  const hi = `Hi ${first(firstName)}`;
  if (step === 1)
    return `${hi}, your growth plan is one step away. Pick a 15-min time that suits you: ${link} Accelur8`;
  if (step === 2)
    return `${hi}, still want more booked jobs and reliable cleaners? 15 minutes is all it takes: ${link} Accelur8`;
  return `${hi}, last nudge from us. If now isn't the right time, no problem. When you're ready: ${link} Accelur8`;
}

// Unqualified growth leads (solo or just researching) never get a call: they are
// sent into the free Google Check, which leads to the paid visibility fix.
export const CHECK_LINK = "https://repsuites.com/check?n=cleaning&src=grw-sms";
export function isCheckRoute(tags: string[]): boolean {
  return !tags.includes("qualified") && (tags.includes("nurture") || tags.includes("solo"));
}
export function checkSms(
  step: ChaseStep,
  firstName: string | null | undefined,
  business: string | null | undefined,
): string {
  const hi = `Hi ${first(firstName)}`;
  const biz = (business ?? "").trim() || "your business";
  if (step === 1)
    return `${hi}, when someone near you searches for a cleaner, does ${biz} come up? Get your free Google Check in 30 seconds: ${CHECK_LINK} Accelur8 (reply STOP to opt out)`;
  if (step === 2)
    return `${hi}, most cleaning jobs go to the 3 firms Google shows first. See where ${biz} sits, free: ${CHECK_LINK} Accelur8`;
  return `${hi}, last one from us. Your free Google Check for ${biz} is still here when you want it: ${CHECK_LINK} Accelur8`;
}
