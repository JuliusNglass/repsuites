// Tracked short links for nurture texts and emails:
// https://repsuites.com/l/<code>?c=<GHL contact id> logs the click, tags the
// contact in GHL, then sends them on. Pure data, safe to unit test.

export const LINKS: Record<string, string> = {
  busy: "https://youtu.be/ZJnUYly_b4A",
  firsthour: "https://youtube.com/shorts/R5gMblXOLiU",
  sick: "https://youtube.com/shorts/iYRfe2a6Loc",
  askreview: "https://youtube.com/shorts/5_wlX_M_wKw",
  payroll: "https://youtu.be/0vRAv1Fnoow",
  hourly: "https://youtube.com/shorts/GFGoB5KC26M",
  top3: "https://youtube.com/shorts/drUw51M-00s",
  channel: "https://www.youtube.com/@accelur8-er5fx",
  scorecard: "https://ops.accelur8clientwork.com/scorecard?utm_source=nurture",
  // The £1 trial is no longer offered (22 Nov): old trial links go to the offer page.
  trial: "https://growth.accelur8clientwork.com/commercial?utm_source=nurture",
  videos: "https://repsuites.com/videos?utm_source=nurture",
  // Unlisted YouTube copy of the commercial video, for leads wary of other links.
  yt: "https://youtu.be/ByRUFtEiSe4",
  commercial: "https://growth.accelur8clientwork.com/commercial?utm_source=nurture",
  hiring: "https://growth.accelur8clientwork.com/hiring?utm_source=nurture",
  reactivation: "https://growth.accelur8clientwork.com/reactivation?utm_source=nurture",
};

export const CONTACT_RE = /^[A-Za-z0-9]{10,40}$/;

/** Where a code goes. Growth pages get the contact's first name if known. */
export function target(code: string, firstName?: string | null): string | null {
  const url = LINKS[code];
  if (!url) return null;
  if (firstName && url.includes("growth.accelur8clientwork.com"))
    return `${url}&first_name=${encodeURIComponent(firstName.slice(0, 40))}`;
  return url;
}
