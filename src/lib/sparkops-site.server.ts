// Server-only: reads a cleaning business's website once for the SparkOps
// report: is there online booking, are they hiring, how big is the team.
// At most 6 page fetches (redirects count), so a report build stays inside
// the Worker's 50 outside calls. Anything we cannot read is left as unknown.
import { getPage, safeSiteUrl } from "./prospect-contact.server";
import { siteSignals, teamFromText, type OpsSignals, type ReviewScan } from "./sparkops";

export async function opsSignals(
  website: string,
  reviews: ReviewScan | null,
  reviewTexts: string[],
): Promise<OpsSignals> {
  const out: OpsSignals = { reviews, booking: null, hiring: false, team: null, teamFrom: null };
  const fromReviews = teamFromText(reviewTexts.join(" . "));
  if (fromReviews) {
    out.team = fromReviews;
    out.teamFrom = "reviews";
  }
  const start = website ? safeSiteUrl(website) : "";
  if (!start) return out;
  try {
    const budget = { left: 6 };
    const home = await getPage(start, budget);
    // A tiny page is often a script-only site we cannot read: say nothing.
    if (!home || home.html.length < 2000) return out;
    const a = siteSignals(home.html, home.url);
    out.hiring = a.hiring;
    if (a.team) {
      out.team = a.team;
      out.teamFrom = "website";
    }
    if (a.booking) out.booking = "found";
    else if (!a.bookLink) out.booking = "none";
    else if (new URL(a.bookLink).hostname !== new URL(home.url).hostname) {
      // A "Book" link to another site is almost always a booking tool.
      out.booking = "found";
    } else {
      const page = await getPage(a.bookLink, budget);
      if (page) {
        const b = siteSignals(page.html, page.url);
        out.booking = b.booking ? "found" : "none";
        out.hiring ||= b.hiring;
        if (!out.team && b.team) {
          out.team = b.team;
          out.teamFrom = "website";
        }
      }
    }
  } catch {
    // Unknown stays unknown.
  }
  return out;
}
