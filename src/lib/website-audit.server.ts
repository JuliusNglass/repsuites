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
  const page = await getPage(website, { left: 4 });
  return page ? auditHomepage(page.html, page.url, checkedAt, google) : empty("unavailable");
}
