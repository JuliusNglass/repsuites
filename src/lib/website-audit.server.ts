import { getPage, safeSiteUrl } from "./prospect-contact.server";
import { auditHomepage, type GoogleDetails, type WebsiteAudit } from "./website-audit";

export async function checkWebsite(
  website: string,
  google: GoogleDetails = {},
): Promise<WebsiteAudit> {
  const checkedAt = new Date().toISOString();
  const empty = (status: WebsiteAudit["status"]): WebsiteAudit => ({
    version: 1,
    checkedAt,
    url: website,
    status,
    findings: [],
  });
  if (!website) return empty("no_website");
  if (!safeSiteUrl(website)) return empty("unavailable");
  // Small-business sites are often slow or heavy (website builders), so the
  // homepage check waits longer and reads more than contact scraping does
  // (up to 10 seconds and 2.5 MB).
  const page = await getPage(website, { left: 4 }, { timeoutMs: 10_000, maxBytes: 2_500_000 });
  return page ? auditHomepage(page.html, page.url, checkedAt, google) : empty("unavailable");
}
