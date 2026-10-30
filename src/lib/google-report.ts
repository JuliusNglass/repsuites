// Pure: the monthly Google report email (subject, plain text and HTML).
// No em dashes, no mention of the software behind it.
import { change, type PerfTotals, type SearchTerm } from "./google-performance";

export interface ReportData {
  business: string;
  title: string;
  monthLabel: string; // "October 2026"
  current: PerfTotals;
  previous: PerfTotals;
  reviews: { now: number; before: number; avgNow: number | null; avgBefore: number | null };
  searchTerms: SearchTerm[];
}

// Last full calendar month, and the month before it.
export function monthPeriods(today: Date): {
  start: string;
  split: string;
  end: string;
  month: Date;
  key: string;
} {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const month = new Date(Date.UTC(y, m - 1, 1));
  const before = new Date(Date.UTC(y, m - 2, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start: iso(before),
    split: iso(month),
    end: iso(end),
    month,
    key: iso(month).slice(0, 7),
  };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function trendText(now: number, before: number): string {
  const c = change(now, before);
  if (c === null) return before === 0 && now > 0 ? "new" : "no change";
  if (c === 0) return "no change";
  return `${c > 0 ? "up" : "down"} ${Math.abs(c)}%`;
}

export function reportRows(d: ReportData): [string, number, string][] {
  return [
    [
      "Seen on Google Search",
      d.current.searchViews,
      trendText(d.current.searchViews, d.previous.searchViews),
    ],
    [
      "Seen on Google Maps",
      d.current.mapsViews,
      trendText(d.current.mapsViews, d.previous.mapsViews),
    ],
    ["Calls from Google", d.current.calls, trendText(d.current.calls, d.previous.calls)],
    [
      "Website clicks",
      d.current.websiteClicks,
      trendText(d.current.websiteClicks, d.previous.websiteClicks),
    ],
    [
      "Directions asked for",
      d.current.directions,
      trendText(d.current.directions, d.previous.directions),
    ],
    ["New Google reviews", d.reviews.now, trendText(d.reviews.now, d.reviews.before)],
  ];
}

export function reportSubject(d: ReportData): string {
  return `Your Google profile in ${d.monthLabel}`;
}

export function reportText(d: ReportData): string {
  const lines = [
    `Your Google profile in ${d.monthLabel}${d.title ? ` (${d.title})` : ""}`,
    "",
    ...reportRows(d).map(
      ([label, n, t]) => `${label}: ${n.toLocaleString("en-GB")} (${t} on the month before)`,
    ),
  ];
  if (d.reviews.avgNow !== null) lines.push(`Average stars from new reviews: ${d.reviews.avgNow}`);
  if (d.searchTerms.length) {
    lines.push("", "What people searched to find you:");
    d.searchTerms
      .slice(0, 10)
      .forEach((t, i) =>
        lines.push(`${i + 1}. ${t.term} (${t.under ? `under ${t.count}` : t.count})`),
      );
  }
  return lines.join("\n");
}

export function reportHtml(d: ReportData): string {
  const rows = reportRows(d)
    .map(
      ([label, n, t]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(label)}</td>` +
        `<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${n.toLocaleString("en-GB")}</td>` +
        `<td style="padding:8px 12px;border-bottom:1px solid #eee;color:${t.startsWith("up") ? "#047857" : t.startsWith("down") ? "#b91c1c" : "#6b7280"}">${esc(t)}</td></tr>`,
    )
    .join("");
  const terms = d.searchTerms
    .slice(0, 10)
    .map(
      (t) =>
        `<li>${esc(t.term)} <span style="color:#6b7280">(${t.under ? `under ${t.count}` : t.count})</span></li>`,
    )
    .join("");
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:560px">` +
    `<h2 style="margin:0 0 4px">Your Google profile in ${esc(d.monthLabel)}</h2>` +
    (d.title ? `<p style="margin:0 0 16px;color:#6b7280">${esc(d.title)}</p>` : "") +
    `<table style="border-collapse:collapse;width:100%">${rows}</table>` +
    (d.reviews.avgNow !== null
      ? `<p>Average stars from new reviews: <b>${d.reviews.avgNow}</b>${d.reviews.avgBefore !== null ? ` (was ${d.reviews.avgBefore})` : ""}</p>`
      : "") +
    (terms
      ? `<p style="margin:16px 0 4px"><b>What people searched to find you</b></p><ol style="margin:0;padding-left:20px">${terms}</ol>`
      : "") +
    `<p style="color:#6b7280;font-size:12px;margin-top:20px">Changes compare with the month before. Figures come from Google and can change slightly as Google finishes counting.</p>` +
    `</div>`
  );
}
