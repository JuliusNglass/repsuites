// Client-safe formatting helpers for the verified schema.
// Pure functions only - safe to import anywhere.

export function penceToCurrencyString(pence: number | null | undefined, currency = "GBP"): string {
  const value = Number(pence) || 0;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value / 100);
  } catch {
    return (value / 100).toFixed(2);
  }
}

export function minutesToHours(minutes: number | null | undefined): string {
  const mins = Number(minutes) || 0;
  if (!mins) return "-";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// start_minutes is business-local wall time (minutes from midnight).
export function minutesToWallTime(minutes: number | null | undefined): string {
  const mins = Number(minutes) || 0;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Render a job's start time, showing "Flexible" for flexible_start jobs.
export function jobStartLabel(flexible: boolean, startMinutes: number | null | undefined): string {
  return flexible ? "Flexible" : minutesToWallTime(startMinutes);
}

// Format a date-only value as weekday DD-MM-YYYY without converting through UTC.
export function formatVisitDate(iso: string | null | undefined, dateFormat = "DD-MM-YYYY"): string {
  if (!iso) return "Unscheduled";
  // Split calendar parts directly to avoid TZ shifts on date-only values.
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  if (dateFormat === "YYYY-MM-DD") return `${yyyy}-${mm}-${dd}`;
  if (dateFormat === "MM-DD-YYYY") return `${mm}-${dd}-${yyyy}`;
  return `${weekday} ${dd}-${mm}-${yyyy}`;
}

// Compose a full "weekday DD-MM-YYYY · HH:MM–HH:MM" label for a job.
export function formatJobSchedule(
  job: {
    visit_date?: string | null;
    start_minutes?: number | null;
    duration_minutes?: number | null;
  },
  dateFormat = "DD-MM-YYYY",
): string {
  const date = formatVisitDate(job.visit_date, dateFormat);
  const start = minutesToWallTime(job.start_minutes);
  if (job.start_minutes == null) return date;
  if (job.duration_minutes != null) {
    const endMin = (Number(job.start_minutes) || 0) + (Number(job.duration_minutes) || 0);
    return `${date} · ${start}–${minutesToWallTime(endMin)}`;
  }
  return `${date} · ${start}`;
}

// Shift a YYYY-MM-DD date by a number of days WITHOUT converting through UTC.
// Parses calendar parts locally and reassembles, so 2026-10-08 +1 = 2026-10-09
// in every timezone.
export function shiftDateIso(iso: string, deltaDays: number): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y = NaN, m = NaN, d = NaN] = parts.map(Number);
  const base = new Date(y, m - 1, d);
  if (Number.isNaN(base.getTime())) return iso;
  base.setDate(base.getDate() + deltaDays);
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Build a readable structured address from a site, joining only the fields
// that are present. Omits missing values rather than inventing placeholders.
export function formatSiteAddress(
  site:
    | {
        address_line_1?: string | null;
        address_line_2?: string | null;
        city?: string | null;
        region?: string | null;
        postcode?: string | null;
        country?: string | null;
      }
    | null
    | undefined,
): string {
  if (!site) return "";
  const lines: string[] = [];
  if (site.address_line_1) lines.push(site.address_line_1);
  if (site.address_line_2) lines.push(site.address_line_2);
  const cityRegion = [site.city, site.region].filter(Boolean).join(", ");
  if (cityRegion) lines.push(cityRegion);
  if (site.postcode) lines.push(site.postcode);
  if (site.country) lines.push(site.country);
  return lines.join(", ");
}

// Normalise a postcode to UPPER(TRIM(postcode)) - always stored this way
// regardless of what the user types. Pure, client-safe.
export function normalisePostcode(postcode: string | null | undefined): string {
  if (!postcode || typeof postcode !== "string") return "";
  return postcode.trim().toUpperCase();
}

// Today's date in the tenant's business timezone, as YYYY-MM-DD (local wall date).
export function todayIsoInTimezone(timezone: string): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
