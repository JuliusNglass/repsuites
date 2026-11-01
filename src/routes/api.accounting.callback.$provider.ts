// QuickBooks, Xero and FreeAgent send the owner back here after they allow
// access. Like the Google and Meta callbacks, a tiny page moves on to the
// dashboard itself so the SameSite=Strict sign-in cookie is sent.
import { createFileRoute } from "@tanstack/react-router";
import { finishAccountingConnect } from "../lib/accounting.server";

function bouncePage(to: string): string {
  const safe = to.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${safe}"><title>RepSuites</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:48px">
<p>Taking you back to RepSuites...</p><p><a href="${safe}">Continue</a></p></body></html>`;
}

export const Route = createFileRoute("/api/accounting/callback/$provider")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const to = await finishAccountingConnect(
          String(params.provider || ""),
          new URL(request.url).searchParams,
        );
        const dest = /^https:\/\/(www\.)?repsuites\.com\//.test(to)
          ? to
          : "https://repsuites.com/dashboard#settings";
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
