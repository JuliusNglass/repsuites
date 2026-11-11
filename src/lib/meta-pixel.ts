// Meta Pixel (browser side). The Pixel ID is public, so it lives in code.
// Leave it blank to switch all tracking off.
export const META_PIXEL_ID = "";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// Standard Meta loader, then a PageView. Returned as a string for <script>.
export function pixelBootScript(id: string): string {
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');`;
}

// Fire a standard event. eventId lets Meta match it with the server copy
// so the same lead or sale is only counted once.
export function trackPixel(
  event: "Lead" | "Purchase",
  data: Record<string, unknown>,
  eventId: string,
) {
  if (!META_PIXEL_ID || typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", event, data, { eventID: eventId });
}

export function newEventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
