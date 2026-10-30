// Google sends the business owner back here after they allow access to their
// Business Profile. The sign-in cookie is SameSite=Strict, so the browser does
// not send it on a redirect chain that started at Google. Instead of a 302 we
// return a tiny page that moves on to the dashboard itself: that navigation
// starts on repsuites.com, so the cookie is sent and the person stays signed in.
import { createFileRoute } from "@tanstack/react-router";
import { finishGoogleConnect } from "../lib/google-business.server";

function bouncePage(to: string): string {
  const safe = to.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${safe}"><title>RepSuites</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:48px">
<p>Connected. Taking you back to RepSuites...</p><p><a href="${safe}">Continue</a></p></body></html>`;
}

export const Route = createFileRoute("/api/google/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const to = await finishGoogleConnect(new URL(request.url).searchParams);
        // Only ever bounce to our own site.
        const dest = /^https:\/\/(www\.)?repsuites\.com\//.test(to)
          ? to
          : "https://repsuites.com/dashboard";
        return new Response(bouncePage(dest), {
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
