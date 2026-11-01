// Tracked review-request link: https://repsuites.com/q/<token>
// Opening it is recorded (a soft signal) and goes to the business's review
// page. ?click=<n>&qr=<id> records a tap on a review site, then goes there.
// ?unsub=1 (and the older ?stop=1) unsubscribes the customer from this
// business's review requests: one click in a real browser, while email link
// scanners that do not run scripts change nothing. POST does it straight
// away (the List-Unsubscribe one-click header).
import { createFileRoute } from "@tanstack/react-router";
import { openRequest, recordRequestClick, unsubscribeRequest } from "../lib/review-requests.server";

const page = (title: string, text: string, extra = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="/favicon.ico?v=2" sizes="any"><link rel="icon" href="/favicon.png?v=2" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
  `<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6faf9;color:#0b1b33;font-size:1.125rem;line-height:1.6;letter-spacing:.01em}main{max-width:30rem;margin:0 auto;padding:56px 20px}p{color:#334155}button{font:inherit;font-weight:700;border:0;border-radius:12px;padding:12px 18px;min-height:48px;background:#0b1b33;color:#fff;cursor:pointer}:focus-visible{outline:3px solid #0b1b33;outline-offset:3px;box-shadow:0 0 0 6px #f5b324}</style>` +
  `</head><body><main><h1>${title}</h1><p>${text}</p>${extra}</main></body></html>`;

const HTML = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

const missing = () =>
  new Response(
    page("Link not found", "This link has expired. Please ask the business for a new one."),
    { status: 404, headers: HTML },
  );

const done = () =>
  new Response(
    page("You are unsubscribed", "You will not get any more review requests from this business."),
    { status: 200, headers: HTML },
  );

export const Route = createFileRoute("/q/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const token = String(params.token || "");
        if (url.searchParams.get("unsub") === "1" || url.searchParams.get("stop") === "1") {
          // A form the page submits by itself: a real browser unsubscribes in
          // one click; a scanner that only fetches the page does not.
          return new Response(
            page(
              "Unsubscribe",
              "Stop review requests from this business?",
              `<form id="u" method="post" action="/q/${encodeURIComponent(token)}?unsub=1"><button type="submit">Yes, unsubscribe me</button></form>` +
                `<script>document.getElementById("u").submit()</script>`,
            ),
            { status: 200, headers: HTML },
          );
        }
        const click = url.searchParams.get("click");
        if (click !== null) {
          const qr = url.searchParams.get("qr") ?? "";
          const to = await recordRequestClick(token, qr, Math.max(0, Number(click) || 0));
          return to && to.startsWith("https://") ? Response.redirect(to, 302) : missing();
        }
        // Link previews (WhatsApp, iMessage) and email safety scanners open
        // links automatically. Only a real browser running the page's script
        // reaches ?go=1, so only real taps count as opened.
        const go = url.searchParams.get("go") === "1";
        if (!go) {
          const r = await openRequest(token, false);
          if (!("redirect" in r)) return missing();
          const next = JSON.stringify(`/q/${token}?go=1`);
          return new Response(
            `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="/favicon.ico?v=2" sizes="any"><link rel="icon" href="/favicon.png?v=2" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Leave a review</title>` +
              `<meta property="og:title" content="Leave a quick review"><meta property="og:description" content="It takes about 30 seconds. Thank you!">` +
              `<noscript><meta http-equiv="refresh" content="0;url=${r.redirect.replace(/\?rq=.*$/, "")}"></noscript></head>` +
              `<body style="font-family:system-ui,sans-serif;font-size:1.125rem;line-height:1.6;padding:60px 20px;color:#334155;background:#f6faf9">Opening the review page...` +
              `<script>location.replace(${next})</script></body></html>`,
            { status: 200, headers: HTML },
          );
        }
        const r = await openRequest(token, true);
        return "redirect" in r ? Response.redirect(r.redirect, 302) : missing();
      },
      POST: async ({ params }) => {
        const ok = await unsubscribeRequest(String(params.token || ""));
        return ok ? done() : missing();
      },
    },
  },
});
