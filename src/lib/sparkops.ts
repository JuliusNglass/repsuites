// SparkOps prospecting: the calculator on the report, the outreach messages
// and the cleaning niches. Pure and client-safe, so it is easy to test.
// No em dashes in this copy (AGENTS.md).

export const PRODUCTS = ["repsuites", "sparkops"] as const;
export type Product = (typeof PRODUCTS)[number];

export function asProduct(v: unknown): Product {
  return v === "sparkops" ? "sparkops" : "repsuites";
}

export const PRODUCT_LABEL: Record<Product, string> = {
  repsuites: "RepSuites",
  sparkops: "SparkOps",
};

// The quick-pick searches on the Find tab in SparkOps mode.
export const SPARKOPS_NICHES = [
  "cleaning company",
  "domestic cleaner",
  "office cleaning",
  "end of tenancy cleaning",
  "carpet cleaning",
  "window cleaning",
] as const;

// "cleaning company in Newport" when the box has "dentists in Newport";
// "cleaning company in " when there is no town yet, ready to type one.
export function nicheQuery(niche: string, current: string): string {
  const town = /\s(?:in|near|around)\s+(.+)$/i.exec(current.trim())?.[1]?.trim() ?? "";
  return `${niche} in ${town}`;
}

// ---------- "Where the hours go" ----------

export interface OpsInput {
  cleaners: number;
  cleans: number; // cleans a week
  minutes: number; // minutes of admin per clean today
  rate: number; // what an hour of the owner's time is worth, in pounds
}

export const OPS_DEFAULTS: OpsInput = { cleaners: 5, cleans: 60, minutes: 6, rate: 15 };

// The share of admin time SparkOps is assumed to save. An estimate, and the
// report says so.
export const OPS_CUT = 0.6;

// The sum, step by step, from the owner's own numbers. Self-contained on
// purpose (no outside names): the report page puts this exact function in its
// script, so the sliders and the server-drawn sums can never disagree.
// Worked example: 60 cleans x 6 minutes = 360 minutes = 6 hours a week now;
// with SparkOps about 60% less, 6 x 0.4 = 2.4 hours; saved 6 - 2.4 = 3.6
// hours a week; 3.6 x 52 = 187 hours a year; 187 x £15 = £2,805 a year.
export function opsCalc(i: { cleaners: number; cleans: number; minutes: number; rate: number }) {
  const whole = (n: number) => Math.max(0, Math.round(Number(n) || 0));
  const one = (n: number) => Math.round(n * 10) / 10;
  const num = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  const cut = 0.6;
  const cleaners = Math.max(1, whole(i.cleaners));
  const cleans = whole(i.cleans);
  const minutes = whole(i.minutes);
  const rate = whole(i.rate);
  const weekMinutes = cleans * minutes;
  const nowHours = one(weekMinutes / 60);
  const keep = one(1 - cut);
  const withHours = one(nowHours * keep);
  const savedWeek = one(nowHours - withHours);
  const savedYear = Math.round(savedWeek * 52);
  const worth = savedYear * rate;
  const perCleaner = one(cleans / cleaners);
  const h = (n: number) => `${num(n)} hour${n === 1 ? "" : "s"}`;
  return {
    nowHours,
    withHours,
    savedWeek,
    savedYear,
    worth,
    lines: [
      `${num(cleans)} cleans &times; ${num(minutes)} minutes = <b>${num(weekMinutes)} minutes</b> a week`,
      `${num(weekMinutes)} minutes &divide; 60 = <b>${h(nowHours)}</b> of admin a week now`,
      `With SparkOps, about ${Math.round(cut * 100)}% less: ${num(nowHours)} &times; ${num(keep)} = <b>${h(withHours)}</b> a week`,
      `${num(nowHours)} &minus; ${num(withHours)} = <b>${h(savedWeek)} saved</b> every week`,
      `${num(savedWeek)} &times; 52 weeks = <b>${h(savedYear)}</b> a year`,
      `${num(savedYear)} hours &times; &pound;${num(rate)} = <b>&pound;${num(worth)}</b> of your time a year`,
    ],
    team: `${num(cleaners)} cleaner${cleaners === 1 ? "" : "s"} doing ${num(cleans)} cleans is about <b>${num(perCleaner)} cleans each</b> a week.`,
    total: `&pound;${num(worth)}`,
  };
}

// ---------- outreach ----------

export interface SparkProspect {
  name: string;
  contactName?: string;
  hook?: string | null; // where they show on Google Maps (rankingHook)
  gap?: { leader: string; leaderReviews: number; reviews: number } | null;
  // Reviews that mention a late, missed or rushed clean.
  scan?: { count: number; total: number; quote: string } | null;
}

export const SPARK_QUESTION = "How do you run your rota at the moment: WhatsApp, paper or an app?";
export const SPARK_HOOK = "Most cleaning owners spend about 6 hours a week on rota and admin.";

// One finding: the map first, else the review gap.
// Worked example: "Shine Co has 120 Google reviews. You have 14."
export function sparkFinding(p: SparkProspect): string {
  if (p.hook) return p.hook.replace(/\.$/, "") + ".";
  const g = p.gap;
  if (g && g.leader && g.leaderReviews > g.reviews)
    return `${g.leader} has ${g.leaderReviews.toLocaleString("en-GB")} Google reviews. You have ${g.reviews.toLocaleString("en-GB")}.`;
  return "";
}

// The first message for a cleaning business. Worked example: "Hi Sam, I'm
// Julius. My wife runs a cleaning company, so I built SparkOps to run hers,
// and I put together a short report for Sparkle Clean. For "cleaning
// company", you're in Google's top 3 in only 2 of the 25 spots I checked
// around you. Most cleaning owners spend about 6 hours a week on rota and
// admin. The report shows where those hours go: <link>" then the question.
export function sparkMessage(
  p: SparkProspect,
  link: string,
  opts: { video?: boolean; email?: boolean } = {},
): string {
  const hi = p.contactName?.trim() ? `Hi ${p.contactName.trim().split(/\s+/)[0]}` : "Hi";
  const finding = sparkFinding(p);
  const made = opts.video
    ? `I recorded a quick video for ${p.name}`
    : `I put together a short report for ${p.name}`;
  const line = reviewScanLine(p.scan);
  const scan = line && p.scan?.quote ? `${line} One says: "${p.scan.quote}"` : line;
  const body = `${hi}, I'm Julius. My wife runs a cleaning company, so I built SparkOps to run hers, and ${made}.${finding ? ` ${finding}` : ""}${scan ? ` ${scan}` : ""}\n\n${SPARK_HOOK} ${opts.video ? "Watch it here" : "The report shows where those hours go"}: ${link}\n\n${SPARK_QUESTION}`;
  return opts.email ? `${body}\n\nReply STOP and I won't message again.` : body;
}

export function sparkSubject(name: string, video = false): string {
  return video ? `A quick video for ${name}` : `Where the hours go at ${name}`;
}

// ---------- "Do any of these sound familiar?" ----------

export const OPS_CHECKS: { pain: string; fix: string }[] = [
  {
    pain: "The rota lives on WhatsApp or paper",
    fix: "One rota with route planning, sent straight to each cleaner's app.",
  },
  {
    pain: "Cleaners text you to ask the address or the key code",
    fix: "The cleaners' app shows the address, key code and notes for every clean, and sends the client an 'on my way' text.",
  },
  {
    pain: "Cleans get missed or double-booked",
    fix: "Every booking in one calendar, with route planning, so nothing clashes or slips.",
  },
  {
    pain: "You chase timesheets every payday",
    fix: "Cleaners clock in and out on the app. Timesheets add up themselves, with a payroll export.",
  },
  {
    pain: "Invoices go out late",
    fix: "Invoices are sent from the same system as soon as the clean is done.",
  },
  {
    pain: "No proof the clean was done",
    fix: "Checklists with photos and the client's signature, for every clean.",
  },
  {
    pain: "Clients are not asked for a review",
    fix: "An automatic review request after each clean.",
  },
  {
    pain: "Finding new cleaners takes weeks",
    fix: "A recruitment pipeline: applications, interviews and starters in one place.",
  },
];

// ---------- signals from reviews and the website ----------

// Words in a review that point to an operations problem. "late" and the rest
// are whole words, and a "never" or "not" just before cancels the match
// ("never late" is praise).
const OPS_WORDS =
  /\b(late|missed|didn'?t turn up|did not turn up|no[- ]show|different cleaners?|rushed|forgot|forgotten|rebook(?:ed|ing)?|cancell?ed)\b/i;
const NEGATED = /\b(never|not|wasn'?t|weren'?t|isn'?t|aren'?t|without|no)\b[^.!?]{0,14}$/i;

export interface ReviewScan {
  count: number; // reviews that mention a problem
  total: number; // reviews read
  quote: string; // a short example, under 15 words
}

// A short, plain excerpt around the matched words: at most 14 words.
function excerpt(text: string, at: number): string {
  const starts = [...text.slice(0, at).matchAll(/[.!?]\s+/g)];
  const from = starts.length
    ? starts[starts.length - 1]!.index! + starts[starts.length - 1]![0].length
    : 0;
  const end = text.slice(at).search(/[.!?](\s|$)/);
  const sentence = text.slice(from, end < 0 ? undefined : at + end).trim();
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= 14) return sentence;
  // The word the match is in, with words either side.
  const before = text.slice(from, at).split(/\s+/).filter(Boolean).length;
  const first = Math.max(0, Math.min(before - 5, words.length - 14));
  const part = words.slice(first, first + 14).join(" ");
  return `${first > 0 ? "..." : ""}${part}${first + 14 < words.length ? "..." : ""}`;
}

// Counts reviews that mention a late, missed or rushed clean. Worked
// example: 5 reviews, one says "The cleaner was late twice", gives
// { count: 1, total: 5, quote: "The cleaner was late twice" }.
export function scanReviews(texts: (string | null | undefined)[]): ReviewScan {
  let count = 0;
  let quote = "";
  const list = texts.map((t) => (t ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
  for (const t of list) {
    const re = new RegExp(OPS_WORDS.source, "gi");
    let m: RegExpExecArray | null;
    let hit = -1;
    while ((m = re.exec(t))) {
      if (!NEGATED.test(t.slice(Math.max(0, m.index - 40), m.index))) {
        hit = m.index;
        break;
      }
    }
    if (hit < 0) continue;
    count++;
    if (!quote) quote = excerpt(t, hit).replace(/["“”]/g, "");
  }
  return { count, total: list.length, quote };
}

// The line for the report and the message. Only when there is a match.
export function reviewScanLine(s: ReviewScan | null | undefined): string {
  if (!s || s.count < 1 || s.total < 1) return "";
  return `${s.count} of the ${s.total} newest reviews Google shows for you mention${s.count === 1 ? "s" : ""} a late, missed or rushed clean.`;
}

// Online booking tools we can spot in a page's code.
const BOOKING_TOOLS =
  /(calendly\.com|bookingkoala|launch27|jobber(?:\.com|hq)|getjobber|squareup\.com\/appointments|square\.site\/book|app\.squareup|acuityscheduling|setmore\.com|simplybook|zenmaid|youcanbook\.me|booksy\.com|fresha\.com|housecallpro|servicem8|bookwhen|leadconnectorhq\.com\/widget\/booking|msgsndr\.com|\/widget\/booking\/)/i;
const HIRING =
  /\b(we'?re hiring|we are hiring|now hiring|cleaners wanted|cleaner wanted|join our team|we are recruiting|now recruiting|work for us|careers)\b/i;
const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
};
const TEAM =
  /\b(\d{1,3}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty)\+?\s+(?:(?:fully[- ])?(?:professional|trained|experienced|dedicated|friendly|vetted|insured|dbs[- ]checked|local|reliable|full[- ]time|part[- ]time)\s+)*(cleaners|cleaning staff|staff|employees|team members|cleaning operatives)\b/i;

// "A team of 12 cleaners" gives 12. Only 2 to 200; null when no team is named.
export function teamFromText(text: string): number | null {
  const m = TEAM.exec(text);
  if (!m) return null;
  const raw = m[1]!.toLowerCase();
  const n = /^\d+$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw] ?? 0);
  return n >= 2 && n <= 200 ? n : null;
}

// Plain text from a page's HTML, for the word checks.
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SiteSignals {
  booking: boolean; // a booking tool or a form with a date box
  bookLink: string; // a "Book" link to check next, or ""
  hiring: boolean;
  team: number | null;
}

// What one page shows. The code is checked for booking tools (they live in
// links, iframes and scripts); the words for hiring and team size.
export function siteSignals(html: string, url: string): SiteSignals {
  const text = pageText(html);
  const booking =
    BOOKING_TOOLS.test(html) || /<form[\s\S]{0,4000}?type=["']?(date|datetime-local)\b/i.test(html);
  let bookLink = "";
  if (!booking) {
    const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const label = pageText(m[2]!);
      if (/\bbook\b|booking/i.test(label) || /\/book(ing)?(-now|-online)?\/?$/i.test(m[1]!)) {
        try {
          const u = new URL(m[1]!, url);
          if (u.protocol === "https:" || u.protocol === "http:") {
            bookLink = u.toString();
            break;
          }
        } catch {
          // ignore
        }
      }
    }
  }
  return { booking, bookLink, hiring: HIRING.test(text), team: teamFromText(text) };
}

// Saved on the report (report.ops) for SparkOps. Each part is null when we
// could not tell.
export interface OpsSignals {
  reviews: ReviewScan | null;
  booking: "found" | "none" | null;
  hiring: boolean;
  team: number | null;
  teamFrom: "website" | "reviews" | null;
}
