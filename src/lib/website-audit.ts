// Static homepage observations. Absence in HTML is not proof about rendered JS.
export interface WebsiteFinding {
  id: string;
  status: "pass" | "review";
  label: string;
  evidence: string;
  recommendation: string;
}
export interface WebsiteAudit {
  version: 1;
  checkedAt: string;
  url: string;
  status: "checked" | "unavailable" | "no_website";
  findings: WebsiteFinding[];
}

const text = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
function attribute(tag: string, name: string): string {
  return (
    tag
      .match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
      ?.slice(1)
      .find((v) => v !== undefined) ?? ""
  );
}

export function auditHomepage(html: string, url: string, checkedAt: string): WebsiteAudit {
  // Remove comments and executable/style text before looking for visible tags.
  const markup = html.replace(/<!--[\s\S]*?-->/g, "");
  const visible = markup.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const title = text(visible.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "");
  const headings = [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)]
    .map((m) => text(m[1]!))
    .filter(Boolean);
  const metas = [...visible.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (name: string) =>
    attribute(
      metas.find((t) => attribute(t, "name").toLowerCase() === name) ?? "",
      "content",
    ).trim();
  const phone = [...visible.matchAll(/<a\b[^>]*>/gi)].some((m) =>
    /^tel:\+?[\d ()-]+$/i.test(attribute(m[0], "href")),
  );
  let schema = false;
  for (const m of markup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attribute(m[1]!, "type").toLowerCase() !== "application/ld+json") continue;
    try {
      const parsed: unknown = JSON.parse(m[2]!);
      schema ||= !!parsed && typeof parsed === "object";
    } catch {
      /* invalid JSON is not evidence */
    }
  }
  const check = (
    id: string,
    pass: boolean,
    label: string,
    evidence: string,
    recommendation: string,
  ): WebsiteFinding => ({ id, status: pass ? "pass" : "review", label, evidence, recommendation });
  return {
    version: 1,
    checkedAt,
    url,
    status: "checked",
    findings: [
      check(
        "title",
        !!title,
        "Page title",
        title || "No non-empty title found in the returned HTML.",
        "Use a clear page title describing the service and location where relevant.",
      ),
      check(
        "h1",
        headings.length === 1,
        "Main heading",
        headings.length
          ? `${headings.length} main heading(s): ${headings.join("; ")}`
          : "No non-empty H1 found in the returned HTML.",
        "Check the rendered page has a clear main heading that describes the business.",
      ),
      check(
        "description",
        !!meta("description"),
        "Search description",
        meta("description") || "No meta description found in the returned HTML.",
        "Write an accurate summary of this page for search visitors.",
      ),
      check(
        "viewport",
        !!meta("viewport"),
        "Mobile viewport",
        meta("viewport") || "No viewport declaration found in the returned HTML.",
        "Check the page on a phone and add an appropriate viewport declaration.",
      ),
      check(
        "phone",
        phone,
        "Tap to call",
        phone ? "A telephone link was found." : "No telephone link found in the returned HTML.",
        "Where telephone enquiries matter, add an accessible tap-to-call link and verify the number.",
      ),
      check(
        "schema",
        schema,
        "Structured data",
        schema
          ? "Parseable JSON-LD found. Business identity and schema validity need manual review."
          : "No parseable JSON-LD found in the returned HTML.",
        "Review appropriate structured data against the actual business details and validate it.",
      ),
    ],
  };
}
