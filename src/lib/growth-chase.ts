// Growth page: qualified owners who did not book a Fit Call get up to three
// short texts with their booking link. Pure logic (unit tested); sending lives
// in growth-chase.server.ts.

export type ChaseStep = 1 | 2 | 3;

// 3 minutes, then the next morning, then two mornings later. Later texts only
// go 7:30 to 9:30am UK time, before work: many owners also have a day job.
export const CHASE: { step: ChaseStep; afterMinutes: number }[] = [
  { step: 1, afterMinutes: 3 },
  { step: 2, afterMinutes: 8 * 60 },
  { step: 3, afterMinutes: 44 * 60 },
];

// Leads older than this never start or continue the chase.
export const CHASE_MAX_HOURS = 96;
// Leads from before the chase went live (21 Nov) were followed up by hand.
export const CHASE_START = "2026-11-21T00:00:00Z";

export const CHASE_STOP_TAGS = [
  "grw-booked",
  "grw-future",
  "replied",
  "customer",
  "no-followup",
  "grw-nobook",
  "free-check",
  "q-not-interested",
  "disp-not-interested",
];

// Cleaning owners work every day. The first text goes at any hour, so a lead
// who fills in the form at 1am hears back within minutes. Later texts go any
// day of the week, 7:30 to 9:30am UK time, while their hands are still free.
export function chaseWindowOk(step: ChaseStep, now: Date): boolean {
  if (step === 1) return true;
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  })
    .format(now)
    .split(":")
    .map(Number);
  const mins = (h ?? 0) * 60 + (m ?? 0);
  return mins >= 7 * 60 + 30 && mins < 9 * 60 + 30;
}

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

// First text to a new lead (approved 22 Nov): names the form and the business so
// the link feels safe, and offers email instead.
export function firstSms(
  firstName: string | null | undefined,
  business: string | null | undefined,
  link: string,
): string {
  const biz = (business ?? "").trim() || "your business";
  return `Hi ${first(firstName)}, it's Accelur8, from the form you just filled in for ${biz}. Here's a quick video on how the whole offer works: ${link} It's our own page, with nothing to download or sign up for. Prefer it by email? Just reply EMAIL. Accelur8`;
}

// Unqualified leads (approved 22 Nov): one friendly text, no link, then the
// 12-month email lessons. The £1 trial is no longer texted to anyone.
export function welcomeSms(
  firstName: string | null | undefined,
  business: string | null | undefined,
): string {
  const biz = (business ?? "").trim() || "your business";
  return `Hi ${first(firstName)}, thanks for your answers about ${biz}. Every week you'll get one short email lesson on growing a cleaning business: winning office contracts, hiring good cleaners and getting more reviews. The first one is on its way from Accelur8. If it's not in your inbox, check spam and mark it "not spam". Accelur8`;
}

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

// Team owners who said "in 3 months" or "just researching": the first text is
// the offer video; the next two point at the Why wait video (cost of waiting),
// so they are won over rather than left to drift.
export function isLater(tags: string[]): boolean {
  return tags.includes("qualified") && tags.includes("nurture");
}
export function whyLink(c: Parameters<typeof salesLink>[1]): string {
  return bookLink(c).replace("/book?", "/why?");
}
export function laterSms(
  step: ChaseStep,
  firstName: string | null | undefined,
  link: string,
): string {
  const hi = `Hi ${first(firstName)}`;
  if (step === 2)
    return `${hi}, waiting 3 months feels safe, but every month without a contract is income another firm is taking. This short video shows what waiting really costs: ${link} Accelur8`;
  return `${hi}, last nudge from us. If you'd rather start later, you can pick your start month here and we'll remind you: ${link} Accelur8`;
}

// Owners working alone who want commercial work and are ready now: they can
// win contracts and hire cleaners at the same time, so they get the
// commercial video with words that fit them.
export function growSms(
  step: ChaseStep,
  firstName: string | null | undefined,
  link: string,
): string {
  const hi = `Hi ${first(firstName)}`;
  if (step === 1)
    return `${hi}, thanks for your answers. You can start winning office and school cleaning contracts now, and hire cleaners in time to do them. This 2-minute video shows how: ${link} Accelur8`;
  if (step === 2)
    return `${hi}, did you get a chance to watch it? Contracts and hiring can run side by side, so you're never stuck waiting: ${link} Accelur8`;
  return `${hi}, last nudge from us. The video is here when you're ready: ${link} Accelur8`;
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

// Leads who watched most of the offer video before filling in the form: the
// next texts send them straight to booking rather than asking if they watched.
export function watchedVideo(tags: string[]): boolean {
  return tags.some((t) => {
    const m = /^vsl-(\d+)$/.exec(t);
    return !!m && Number(m[1]) >= 75;
  });
}
export function watchedSms(
  step: ChaseStep,
  firstName: string | null | undefined,
  link: string,
): string {
  const hi = `Hi ${first(firstName)}`;
  if (step === 3)
    return `${hi}, last nudge from us. If now isn't right, no problem. You can pick a time here whenever you're ready: ${link} Accelur8`;
  return `${hi}, glad you watched the video. Pick a time that suits you here and we'll map out your contract plan: ${link} Accelur8`;
}
