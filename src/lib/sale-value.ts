// "What 1 more customer is worth": pure helpers (client-safe).
//
// A business's lowest usual sale, per day or per week, picked by niche from
// the Google category, the search phrases and the business name. The owner
// (or Julius in the Prospects tab) can change it.
//
// Worked example: a car wash at £15 a day, open 6 days a week.
//   6 x 52 = 312 days a year
//   £15 x 312 = £4,680 a year
// A plumber at £150 a week: £150 x 52 = £7,800 a year.
import { isUkAddress } from "./prospect-owner";

export type SalePeriod = "day" | "week";
export type SaleCurrency = "GBP" | "NGN";

export interface SaleDefault {
  amount: number; // whole pounds (or naira)
  period: SalePeriod;
  niche: string; // "car valeting"
}

interface Rule {
  niche: string;
  re: RegExp;
  gbp: number;
  ngn: number;
  period: SalePeriod;
}

// Most specific first: "dog grooming" before "hair", "burger" before
// "restaurant", "valeting" before "car wash".
const RULES: Rule[] = [
  {
    niche: "dog grooming",
    re: /\b(dog|pet|canine)\s*groom|\bgroomer/,
    gbp: 40,
    ngn: 15000,
    period: "day",
  },
  {
    niche: "driving lessons",
    re: /driving\s*(instructor|school|lesson)/,
    gbp: 35,
    ngn: 20000,
    period: "day",
  },
  { niche: "car valeting", re: /valet|detailing|detailer/, gbp: 40, ngn: 20000, period: "day" },
  {
    niche: "a car wash",
    re: /car\s*wash|hand\s*wash|jet\s*wash/,
    gbp: 15,
    ngn: 5000,
    period: "day",
  },
  {
    niche: "a garage",
    re: /\bgarage\b|mechanic|\bmot\b|auto\s*repair|car\s*repair|\btyres?\b|\btires?\b|auto\s*(centre|center|service)/,
    gbp: 60,
    ngn: 30000,
    period: "day",
  },
  {
    niche: "a dentist or clinic",
    re: /dentist|dental|clinic|physio|chiropract|osteopath|optician|doctor|medical/,
    gbp: 60,
    ngn: 30000,
    period: "day",
  },
  { niche: "a barber", re: /barber/, gbp: 15, ngn: 5000, period: "day" },
  {
    niche: "a hair or beauty salon",
    re: /\bhair|beauty|salon|\bnails?\b|\blash|\bbrows?\b|\bspa\b|aesthetic/,
    gbp: 35,
    ngn: 15000,
    period: "day",
  },
  {
    niche: "a gym",
    re: /\bgym\b|fitness|personal\s*train|crossfit|yoga|pilates|boxing|martial\s*art/,
    gbp: 40,
    ngn: 20000,
    period: "week",
  },
  { niche: "cleaning", re: /clean/, gbp: 60, ngn: 30000, period: "day" },
  {
    niche: "a trade business",
    re: /plumb|electric|heating|boiler|gas\s*(engineer|safe)|roof|builder|building\s*(firm|contractor|company)|construction|locksmith|joiner|carpent|plaster|handyman|glazi|window\s*fitt/,
    gbp: 150,
    ngn: 50000,
    period: "week",
  },
  {
    niche: "a takeaway",
    re: /takeaway|take\s*away|fast\s*food|burger|pizza|kebab|chicken|chippy|chip\s*shop|fish\s*(and|&)\s*chips|shawarma|suya/,
    gbp: 15,
    ngn: 5000,
    period: "day",
  },
  {
    niche: "a cafe",
    re: /caf[eé]|coffee|bakery|tea\s*room|sandwich/,
    gbp: 8,
    ngn: 3000,
    period: "day",
  },
  {
    niche: "a restaurant",
    re: /restaurant|bistro|\bgrill\b|diner|eatery|brasserie|steakhouse|canteen|\bbuka/,
    gbp: 30,
    ngn: 10000,
    period: "day",
  },
];

const FALLBACK = { niche: "a local business", gbp: 30, ngn: 10000, period: "day" as SalePeriod };

// Nigeria if the address says so, otherwise pounds.
export function saleCurrency(address: string | null | undefined): SaleCurrency {
  const last = (address ?? "").split(",").pop()?.trim().toLowerCase() ?? "";
  return last === "nigeria" ? "NGN" : "GBP";
}

export function saleSymbol(c: SaleCurrency): string {
  return c === "NGN" ? "₦" : "£";
}

// Only UK businesses see the RepSuites Growth price next to the sum.
export function showsGrowthPrice(address: string | null | undefined): boolean {
  return isUkAddress(address ?? "");
}

// Looks at the Google category first, then the search phrases, then the name.
export function saleDefault(
  input: {
    category?: string | null | undefined;
    keywords?: (string | null | undefined)[];
    name?: string | null | undefined;
  },
  currency: SaleCurrency = "GBP",
): SaleDefault {
  const texts = [input.category, ...(input.keywords ?? []), input.name]
    .map((t) => (t ?? "").toLowerCase().trim())
    .filter(Boolean);
  for (const t of texts) {
    const rule = RULES.find((r) => r.re.test(t));
    if (rule)
      return {
        amount: currency === "NGN" ? rule.ngn : rule.gbp,
        period: rule.period,
        niche: rule.niche,
      };
  }
  return {
    amount: currency === "NGN" ? FALLBACK.ngn : FALLBACK.gbp,
    period: FALLBACK.period,
    niche: FALLBACK.niche,
  };
}

// "day" means open 6 days a week: 6 x 52 = 312 days a year.
export function periodsPerYear(period: SalePeriod): number {
  return period === "week" ? 52 : 6 * 52;
}

export function yearlyValue(amount: number, period: SalePeriod): number {
  return Math.round(amount) * periodsPerYear(period);
}

// "£12,480" or "₦1,560,000": whole numbers with thousands separators.
export function money(amount: number, currency: SaleCurrency = "GBP"): string {
  return `${saleSymbol(currency)}${Math.round(amount).toLocaleString("en-GB")}`;
}

// The slider's range. Naira prices are much bigger numbers.
export function saleRange(currency: SaleCurrency): { min: number; max: number; step: number } {
  return currency === "NGN" ? { min: 1000, max: 500000, step: 500 } : { min: 5, max: 500, step: 1 };
}

// The worked sum, 3 lines, as plain text.
export function saleSumLines(amount: number, period: SalePeriod, currency: SaleCurrency): string[] {
  const a = money(amount, currency);
  const total = money(yearlyValue(amount, period), currency);
  return period === "week"
    ? [
        `1 extra customer a week × ${a} = ${a} a week`,
        "52 weeks a year",
        `${a} × 52 = ${total} a year in extra sales`,
      ]
    : [
        `1 extra customer a day × ${a} = ${a} a day`,
        "Open 6 days a week: 6 × 52 = 312 days a year",
        `${a} × 312 = ${total} a year in extra sales`,
      ];
}

// One short line: "1 extra customer a day at £40 = £12,480 a year".
export function saleOneLine(amount: number, period: SalePeriod, currency: SaleCurrency): string {
  return `1 extra customer a ${period} at ${money(amount, currency)} = ${money(yearlyValue(amount, period), currency)} a year`;
}

// The value to show: the saved one if set, else the default for the niche.
export function saleFor(
  report: {
    business: {
      name?: string | null | undefined;
      address?: string | null | undefined;
      category?: string | null | undefined;
    };
    maps?: { keyword?: string | null | undefined } | null | undefined;
    grids?: { keyword?: string | null | undefined }[] | null | undefined;
  },
  saved: { minSalePence?: number | null | undefined; salePeriod?: string | null | undefined } = {},
): SaleDefault & { currency: SaleCurrency; saved: boolean; fallback: SaleDefault } {
  const currency = saleCurrency(report.business.address);
  const keywords = report.grids?.length
    ? report.grids.map((g) => g.keyword)
    : [report.maps?.keyword];
  const def = saleDefault(
    { category: report.business.category, keywords, name: report.business.name },
    currency,
  );
  const pence = saved.minSalePence;
  const hasAmount = typeof pence === "number" && pence > 0;
  const period =
    saved.salePeriod === "day" || saved.salePeriod === "week" ? saved.salePeriod : def.period;
  return {
    amount: hasAmount ? Math.round(pence / 100) : def.amount,
    period,
    niche: def.niche,
    currency,
    saved: hasAmount || period !== def.period,
    fallback: def,
  };
}
