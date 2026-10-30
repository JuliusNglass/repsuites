/* eslint-disable @typescript-eslint/no-explicit-any -- Google JSON is checked field by field. */
// Pure helpers for the Google profile performance report: totals for a
// period against the period before, and the search words people used.

export const DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
] as const;

export interface PerfTotals {
  searchViews: number;
  mapsViews: number;
  calls: number;
  websiteClicks: number;
  directions: number;
}

export const EMPTY: PerfTotals = {
  searchViews: 0,
  mapsViews: 0,
  calls: 0,
  websiteClicks: 0,
  directions: 0,
};

const KEY: Record<string, keyof PerfTotals> = {
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "searchViews",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "searchViews",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "mapsViews",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "mapsViews",
  CALL_CLICKS: "calls",
  WEBSITE_CLICKS: "websiteClicks",
  BUSINESS_DIRECTION_REQUESTS: "directions",
};

export function isoOf(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

// Splits Google's daily figures into "this period" (on or after splitIso)
// and "the period before".
export function summarise(
  body: unknown,
  splitIso: string,
): { current: PerfTotals; previous: PerfTotals } {
  const current = { ...EMPTY };
  const previous = { ...EMPTY };
  const series = (body as any)?.multiDailyMetricTimeSeries ?? [];
  for (const group of series) {
    for (const s of group?.dailyMetricTimeSeries ?? []) {
      const key = KEY[String(s?.dailyMetric ?? "")];
      if (!key) continue;
      for (const v of s?.timeSeries?.datedValues ?? []) {
        if (!v?.date) continue;
        const n = Number(v.value ?? 0);
        if (!Number.isFinite(n)) continue;
        (isoOf(v.date) >= splitIso ? current : previous)[key] += n;
      }
    }
  }
  return { current, previous };
}

// Change as a whole-number percentage. Worked example: 120 views this month
// and 100 last month is (120 - 100) / 100 = 0.2, so +20%.
export function change(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export interface SearchTerm {
  term: string;
  count: number;
  under: boolean; // Google only says "fewer than N" for small numbers
}

export function searchTerms(body: unknown, limit = 10): SearchTerm[] {
  const rows = (body as any)?.searchKeywordsCounts ?? [];
  const out: SearchTerm[] = [];
  for (const r of rows) {
    const term = String(r?.searchKeyword ?? "").trim();
    if (!term) continue;
    const value = r?.insightsValue?.value;
    const threshold = r?.insightsValue?.threshold;
    if (value !== undefined) out.push({ term, count: Number(value) || 0, under: false });
    else if (threshold !== undefined)
      out.push({ term, count: Number(threshold) || 0, under: true });
  }
  return out.sort((a, b) => b.count - a.count || Number(a.under) - Number(b.under)).slice(0, limit);
}

// Last 28 full days of data (Google is a few days behind) and the 28 before.
export function periods(today: Date): { start: string; split: string; end: string } {
  const day = 86400000;
  const end = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - 3 * day,
  );
  const split = new Date(end.getTime() - 27 * day);
  const start = new Date(split.getTime() - 28 * day);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), split: iso(split), end: iso(end) };
}
