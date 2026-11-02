// Customer Insights: pure helpers (facts worked out in code, the AI answer
// checked, and the email section). Client-safe. No em dashes in copy.

export interface InsightReview {
  stars: number;
  comment: string;
  at: string; // ISO
  replied: boolean;
}
export interface InsightFeedback {
  message: string;
  at: string;
}

export interface InsightFacts {
  periodDays: number;
  reviews: number; // in the period
  reviewsBefore: number; // the same length of time before it
  avg: number | null;
  avgBefore: number | null;
  replyRate: number | null; // percent of period reviews answered
  privateMessages: number;
  withText: number; // reviews or messages with words to read
}

export interface Theme {
  theme: string;
  mentions: number;
  quote: string;
}
export interface InsightSummary {
  headline: string;
  praises: Theme[];
  complaints: Theme[];
  people: { name: string; mentions: number; tone: "positive" | "mixed" | "negative" }[];
  trend: string;
  action: { title: string; why: string };
}

const DAY = 86400000;

function avg(list: number[]): number | null {
  if (!list.length) return null;
  return Math.round((list.reduce((t, n) => t + n, 0) / list.length) * 10) / 10;
}

// Example: 12 reviews in the last 90 days averaging 4.6, against 8 in the
// 90 days before averaging 4.3.
export function insightFacts(
  reviews: InsightReview[],
  feedback: InsightFeedback[],
  now: Date,
  periodDays = 90,
): InsightFacts {
  const start = now.getTime() - periodDays * DAY;
  const before = start - periodDays * DAY;
  const inP = reviews.filter((r) => Date.parse(r.at) >= start);
  const inB = reviews.filter((r) => {
    const t = Date.parse(r.at);
    return t >= before && t < start;
  });
  const fb = feedback.filter((f) => Date.parse(f.at) >= start);
  return {
    periodDays,
    reviews: inP.length,
    reviewsBefore: inB.length,
    avg: avg(inP.map((r) => r.stars)),
    avgBefore: avg(inB.map((r) => r.stars)),
    replyRate: inP.length
      ? Math.round((inP.filter((r) => r.replied).length / inP.length) * 100)
      : null,
    privateMessages: fb.length,
    withText:
      inP.filter((r) => r.comment.trim()).length + fb.filter((f) => f.message.trim()).length,
  };
}

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/—|–/g, "-").trim().slice(0, max) : "";

function themes(v: unknown): Theme[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const n = Number(o["mentions"]);
      return {
        theme: str(o["theme"], 80),
        mentions: Number.isFinite(n) && n > 0 ? Math.round(n) : 1,
        quote: str(o["quote"], 160),
      };
    })
    .filter((t) => t.theme)
    .slice(0, 3);
}

// Accepts the model's JSON (possibly wrapped in a code fence) and keeps only
// well-formed parts. Returns null when nothing usable came back.
export function parseInsightSummary(text: string): InsightSummary | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const headline = str(o["headline"], 200);
  const a = (o["action"] ?? {}) as Record<string, unknown>;
  const action = { title: str(a["title"], 120), why: str(a["why"], 300) };
  if (!headline || !action.title) return null;
  const people = Array.isArray(o["people"])
    ? (o["people"] as unknown[])
        .map((p) => {
          const q = (p ?? {}) as Record<string, unknown>;
          const tone = q["tone"];
          const n = Number(q["mentions"]);
          return {
            name: str(q["name"], 40),
            mentions: Number.isFinite(n) && n > 0 ? Math.round(n) : 1,
            tone: (tone === "negative" || tone === "mixed" ? tone : "positive") as
              "positive" | "mixed" | "negative",
          };
        })
        .filter((p) => p.name)
        .slice(0, 5)
    : [];
  return {
    headline,
    praises: themes(o["praises"]),
    complaints: themes(o["complaints"]),
    people,
    trend: str(o["trend"], 300),
    action,
  };
}

export const INSIGHTS_SYSTEM =
  "You analyse customer feedback for a small UK business and report to the owner in plain British English, " +
  "as a trusted adviser would. No jargon, no em dashes, no emojis, never mention AI or software. " +
  "Only use what is in the feedback; do not invent themes, numbers or names. Group similar comments into themes " +
  "and count how many separate comments mention each. Quotes must be short exact extracts. " +
  "People are staff the customers name (not the customers). If there are no complaints, return an empty list. " +
  "Fill in the customer_insights form: " +
  '{"headline": one sentence on the overall picture, "praises": [{"theme","mentions","quote"}] up to 3, ' +
  '"complaints": [{"theme","mentions","quote"}] up to 3, "people": [{"name","mentions","tone": "positive"|"mixed"|"negative"}], ' +
  '"trend": one or two sentences using the facts given, "action": {"title": the single most useful next step, "why": one sentence}}';

export function insightsPrompt(
  business: string,
  facts: InsightFacts,
  reviews: InsightReview[],
  feedback: InsightFeedback[],
): string {
  const f = facts;
  const lines = [
    `Business: ${business}`,
    `Facts for the last ${f.periodDays} days (worked out already, use as given):`,
    `- Google reviews: ${f.reviews} (previous ${f.periodDays} days: ${f.reviewsBefore})`,
    `- Average stars: ${f.avg ?? "none"} (previous: ${f.avgBefore ?? "none"})`,
    `- Reviews answered: ${f.replyRate === null ? "n/a" : `${f.replyRate}%`}`,
    `- Private messages: ${f.privateMessages}`,
    "",
    "Google reviews (newest first):",
    ...reviews.map(
      (r) => `- ${r.stars} stars, ${r.at.slice(0, 10)}: ${r.comment.trim() || "(no text)"}`,
    ),
    "",
    "Private messages (not public):",
    ...(feedback.length
      ? feedback.map((m) => `- ${m.at.slice(0, 10)}: ${m.message.trim()}`)
      : ["- none"]),
  ];
  return lines.join("\n").slice(0, 60000);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function insightsHtml(s: InsightSummary): string {
  const list = (items: Theme[]) =>
    items
      .map(
        (t) =>
          `<li><b>${esc(t.theme)}</b> <span style="color:#6b7280">(${t.mentions} mention${t.mentions === 1 ? "" : "s"})</span>${t.quote ? `<br><span style="color:#374151">"${esc(t.quote)}"</span>` : ""}</li>`,
      )
      .join("");
  return (
    `<div style="margin-top:24px;padding:16px;border:1px solid #e5e7eb;border-radius:12px">` +
    `<h3 style="margin:0 0 6px">What your customers are saying</h3>` +
    `<p style="margin:0 0 12px">${esc(s.headline)}</p>` +
    (s.praises.length
      ? `<p style="margin:8px 0 4px"><b>What they love</b></p><ul style="margin:0;padding-left:20px">${list(s.praises)}</ul>`
      : "") +
    (s.complaints.length
      ? `<p style="margin:12px 0 4px"><b>What needs attention</b></p><ul style="margin:0;padding-left:20px">${list(s.complaints)}</ul>`
      : "") +
    (s.trend ? `<p style="margin:12px 0 0;color:#374151">${esc(s.trend)}</p>` : "") +
    `<p style="margin:12px 0 0;padding:10px;background:#fffbeb;border-radius:8px"><b>One thing to do this month:</b> ${esc(s.action.title)}<br><span style="color:#374151">${esc(s.action.why)}</span></p>` +
    `</div>`
  );
}
