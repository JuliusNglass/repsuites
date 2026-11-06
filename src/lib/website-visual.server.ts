import { safeSiteUrl } from "./prospect-contact.server";

export type WebsiteVisual = { url: string; screenshot: string; performance: number | null };

// PageSpeed supplies the same final Lighthouse screenshot a consultant sees,
// without adding a browser service or storing files. It is optional because it
// uses an external check and can take several seconds.
export async function captureWebsiteVisual(url: string): Promise<WebsiteVisual | null> {
  if (!safeSiteUrl(url)) return null;
  try {
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("strategy", "mobile");
    endpoint.searchParams.set("category", "performance");
    const key = (process.env["REPSUITES_GOOGLE_MAPS_KEY"] ?? "").trim();
    if (key) endpoint.searchParams.set("key", key);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(45_000) });
    if (!response.ok) return null;
    const body = (await response.json()) as any;
    const screenshot = String(
      body?.lighthouseResult?.audits?.["final-screenshot"]?.details?.data ?? "",
    );
    if (!screenshot.startsWith("data:image/") || screenshot.length > 700_000) return null;
    const raw = body?.lighthouseResult?.categories?.performance?.score;
    return {
      url,
      screenshot,
      performance: typeof raw === "number" ? Math.round(raw * 100) : null,
    };
  } catch {
    return null;
  }
}

