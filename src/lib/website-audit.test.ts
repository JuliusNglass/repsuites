import { describe, expect, it, afterEach, vi } from "vitest";
import { auditHomepage } from "./website-audit";
import { checkWebsite } from "./website-audit.server";
import { websiteEvidence } from "./report-page.server";
import { safeSiteUrl } from "./prospect-contact.server";
import type { Report } from "./prospects.server";

afterEach(() => vi.unstubAllGlobals());
describe("homepage audit evidence", () => {
  it("records real markup and ignores comments and executable text", () => {
    const audit = auditHomepage(
      `<!-- <title>Fake</title> --><script>"<h1>Fake</h1>"</script><title>Plumber &amp; heating</title><h1>Local plumber</h1><meta content='Description' name=description><meta name=viewport content='width=device-width'><a href='tel:+44123456789'>Call</a><script type='application/ld+json'>{"@type":"Plumber"}</script>`,
      "https://example.com/",
      "2026-11-05T12:00:00Z",
    );
    expect(audit.findings.every((f) => f.status === "pass")).toBe(true);
    expect(audit.findings.find((f) => f.id === "h1")?.evidence).not.toContain("Fake");
  });
  it("decodes HTML entities in website evidence", () => {
    const audit = auditHomepage(
      `<title>Nita&#x27;s Cleaning</title><h1>Nita&amp;Co</h1><meta name="description" content="Nita&#39;s cleaners">`,
      "https://example.com/",
      "now",
    );
    expect(audit.findings.find((f) => f.id === "title")?.evidence).toBe("Nita's Cleaning");
    expect(audit.findings.find((f) => f.id === "h1")?.evidence).toContain("Nita&Co");
    expect(audit.findings.find((f) => f.id === "description")?.evidence).toBe("Nita's cleaners");
  });
  it("does not treat invalid JSON-LD as valid evidence", () => {
    const audit = auditHomepage(
      '<script type="application/ld+json">oops</script>',
      "https://example.com/",
      "now",
    );
    expect(audit.findings.find((f) => f.id === "schema")?.status).toBe("review");
  });
  it("escapes all observations in the shareable report", () => {
    const audit = auditHomepage(
      "<title>&lt;script&gt;</title>",
      "https://example.com/<img>",
      "now",
    );
    const html = websiteEvidence({ websiteAudit: audit } as Report);
    expect(html).not.toContain("<img>");
    expect(html).toContain("Page speed, ease of use and completed enquiries need separate checks");
    expect(html).toContain("Next step");
  });
  it("does not infer failures when a fetch or redirect is unsafe", async () => {
    const fetcher = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const audit = await checkWebsite("https://example.com/");
    expect(audit.status).toBe("unavailable");
    expect(audit.findings).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(safeSiteUrl("https://user:password@example.com/")).toBe("");
    expect(safeSiteUrl("https://foo.localhost/")).toBe("");
  });
  it("rejects oversized HTML rather than publishing false missing-element findings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("x".repeat(600_001), { headers: { "content-type": "text/html" } }),
      ),
    );
    expect((await checkWebsite("https://example.com/")).status).toBe("unavailable");
  });
});

