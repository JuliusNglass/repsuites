// Stripe sends people back here after paying or managing their plan. The
// sign-in cookie is SameSite=Strict, so it is not sent on a redirect that
// started at Stripe (that is why people landed on the sign-in page). This tiny
// page moves on to the dashboard itself, so the cookie is sent and they stay
// signed in. Same approach as the Google callback.
import { createFileRoute } from "@tanstack/react-router";

const PAGE = (
  to: string,
  text: string,
) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${to}"><title>RepSuites</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:48px">
<p>${text}</p><p><a href="${to}">Continue</a></p></body></html>`;

export const Route = createFileRoute("/api/billing/back")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const paid = q.get("paid") === "1";
        const body = paid
          ? PAGE(
              "/dashboard?billing=done#settings",
              q.get("trial") === "1"
                ? "Card details added. Your 14-day free trial is starting. Taking you to your dashboard..."
                : "Payment done. Taking you to your dashboard...",
            )
          : PAGE("/dashboard#settings", "Taking you back to RepSuites...");
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      },
    },
  },
});
