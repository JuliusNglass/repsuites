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
// Leads from before the chase went live (21 Nov) were followed up by hand.
export const CHASE_START = "2026-11-21T00:00:00Z";

export const CHASE_STOP_TAGS = [
  "grw-booked",
  "replied",
  "customer",
  "no-followup",
  "grw-nobook",
  "free-check",
  "q-not-interested",
  "disp-not-interested",
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

export type Offer = "commercial" | "hiring" | "reactivation";

/** The sales page that matches what they told us they want. */
export function offerFor(tags: string[]): Offer {
  if (tags.includes("lead-hiring")) return "hiring";
  if (tags.includes("lead-rebook")) return "reactivation";
  return "commercial";
}

/** Their own sales page: video first, then they can book from the page. */
export function salesLink(
  offer: Offer,
  c: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): string {
  return bookLink(c).replace("/book?", `/${offer}?`);
}

const TOPIC: Record<Offer, [string, string]> = {
  commercial: [
    "winning office contracts alongside your domestic work",
    "more contracts that pay every month",
  ],
  hiring: ["hiring reliable cleaners without the chasing", "reliable cleaners who turn up"],
  reactivation: [
    "filling your diary from past customers",
    "your diary filled from customers you already have",
  ],
};

// About them, short, no opt-out line. Never a bare booking link: the page shows
// the video first, and only then offers a time (no call without watching).
export function chaseSms(
  step: ChaseStep,
  firstName: string | null | undefined,
  link: string,
  offer: Offer = "commercial",
): string {
  const hi = `Hi ${first(firstName)}`;
  const [topic, want] = TOPIC[offer];
  if (step === 1)
    return `${hi}, here's a 2-minute video on ${topic}, made for you: ${link} If it fits, you can pick a time from that page. Accelur8`;
  if (step === 2)
    return `${hi}, did you get a chance to watch it? It shows how you get ${want}: ${link} Accelur8`;
  return `${hi}, last nudge from us. If now isn't the right time, no problem. The video is here when you're ready: ${link} Accelur8`;
}

// Unqualified growth leads (solo or just researching) never get a call: they are
// sent the £1 for 30 days review trial instead.
export const CHECK_LINK = "https://repsuites.com/try?utm_source=grw-sms";
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
    return `${hi}, happy customers rarely leave a Google review on their own. For £1, try a tool that asks for you, in the name of ${biz}, for 30 days: ${CHECK_LINK} Accelur8`;
  if (step === 2)
    return `${hi}, most cleaning jobs go to the firms with the most recent Google reviews. 30 days of getting more, for £1: ${CHECK_LINK} Accelur8`;
  return `${hi}, last one from us. The £1 review trial for ${biz} is here when you want it: ${CHECK_LINK} Accelur8`;
}
