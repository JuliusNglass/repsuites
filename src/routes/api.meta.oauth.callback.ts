// Facebook sends the owner back here after they allow access. The sign-in
// cookie is SameSite=Strict, so it is not sent on a redirect that started at
// Facebook. This tiny page moves on to the dashboard itself, so the cookie is
// sent and they stay signed in (same approach as the Google callback).
import { createFileRoute } from "@tanstack/react-router";
import { finishMetaConnect } from "../lib/meta.server";

function bouncePage(to: string): string {
  const safe = to.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${safe}"><title>RepSuites</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:48px">
<p>Connected. Taking you back to RepSuites...</p><p><a href="${safe}">Continue</a></p></body></html>`;
}

export const Route = createFileRoute("/api/meta/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const to = await finishMetaConnect(new URL(request.url).searchParams);
        const dest = /^https:\/\/(www\.)?repsuites\.com\//.test(to)
          ? to
          : "https://repsuites.com/dashboard#posts";
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
