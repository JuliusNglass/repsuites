// Tracked review-request link: https://repsuites.com/q/<token>
// Opening it stops further reminders and goes to the business's review page.
// ?stop=1 turns reminders off for this customer.
import { createFileRoute } from "@tanstack/react-router";
import { openRequest } from "../lib/review-requests.server";

const page = (title: string, text: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
  `<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6faf9;color:#0f172a}main{max-width:28rem;margin:0 auto;padding:56px 20px;text-align:center}p{color:#475569;line-height:1.5}</style>` +
  `</head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

const HTML = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

export const Route = createFileRoute("/q/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const stop = url.searchParams.get("stop") === "1";
        const token = String(params.token || "");
        // Link previews (WhatsApp, iMessage) and email safety scanners open
        // links automatically. Only a real browser running the page's script
        // reaches ?go=1, so only real taps count as opened.
        const go = url.searchParams.get("go") === "1";
        if (!stop && !go) {
          const r = await openRequest(token, false, false);
          if (!("redirect" in r))
            return new Response(
              page(
                "Link not found",
                "This link has expired. Please ask the business for a new one.",
              ),
              { status: 404, headers: HTML },
            );
          const next = JSON.stringify(`/q/${token}?go=1`);
          return new Response(
            `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Leave a review</title>` +
              `<meta property="og:title" content="Leave a quick review"><meta property="og:description" content="It takes about 30 seconds. Thank you!">` +
              `<noscript><meta http-equiv="refresh" content="0;url=${r.redirect}"></noscript></head>` +
              `<body style="font-family:system-ui,sans-serif;text-align:center;padding:60px 20px;color:#475569">Opening the review page...` +
              `<script>location.replace(${next})</script></body></html>`,
            { status: 200, headers: HTML },
          );
        }
        const r = await openRequest(token, stop, true);
        if ("redirect" in r) return Response.redirect(r.redirect, 302);
        if (r.page === "stopped")
          return new Response(page("Done", "You will not get any more reminders. Thank you."), {
            status: 200,
            headers: HTML,
          });
        return new Response(
          page("Link not found", "This link has expired. Please ask the business for a new one."),
          { status: 404, headers: HTML },
        );
      },
    },
  },
});
