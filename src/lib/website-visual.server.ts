import { safeSiteUrl } from "./prospect-contact.server";

export type WebsiteVisual = { url: string; screenshot: string; performance: number | null };

// PageSpeed supplies the same final Lighthouse screenshot a consultant sees,
// without adding a browser service or storing files. It is optional because it
// uses an external check and can take several seconds.
export async function captureWebsiteVisual(url: string): Promise<WebsiteVisual | null> {
  if (!safeSiteUrl(url)) return null;
  try {
    const call = (withKey: boolean) => {
      const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
      endpoint.searchParams.set("url", url);
      endpoint.searchParams.set("strategy", "mobile");
      endpoint.searchParams.set("category", "performance");
      const key = (process.env["REPSUITES_GOOGLE_MAPS_KEY"] ?? "").trim();
      if (withKey && key) endpoint.searchParams.set("key", key);
      return fetch(endpoint, { signal: AbortSignal.timeout(45_000) });
    };
    let response = await call(true);
    // The Maps key may not have the PageSpeed Insights API switched on (403).
    // PageSpeed also works without a key, at a lower daily limit.
    if (response.status === 403 || response.status === 400) {
      console.error(
        "PageSpeed refused the key",
        response.status,
        (await response.text()).slice(0, 200),
      );
      response = await call(false);
    }
    if (!response.ok) {
      console.error("PageSpeed failed", response.status, (await response.text()).slice(0, 200));
      return null;
    }
    const body = (await response.json()) as any;
    const screenshot = String(
      body?.lighthouseResult?.audits?.["final-screenshot"]?.details?.data ?? "",
    );
    if (!screenshot.startsWith("data:image/") || screenshot.length > 700_000) {
      console.error("PageSpeed gave no usable screenshot", screenshot.length);
      return null;
    }
    const raw = body?.lighthouseResult?.categories?.performance?.score;
    return {
      url,
      screenshot,
      performance: typeof raw === "number" ? Math.round(raw * 100) : null,
    };
  } catch (err) {
    console.error("PageSpeed error", String((err as Error)?.message ?? err).slice(0, 200));
    return null;
  }
}
