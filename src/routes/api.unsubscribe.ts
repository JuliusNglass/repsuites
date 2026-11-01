// "Stop these emails" link in follow-up emails. The link opens a page with one
// button, so email scanners that open links cannot unsubscribe people.
import { createFileRoute } from "@tanstack/react-router";
import { unsubscribe } from "../lib/lifecycle.server";

const page = (body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>RepSuites emails</title></head><body style="font-family:system-ui,sans-serif;font-size:1.125rem;line-height:1.6;padding:48px 16px;color:#0b1b33;background:#f6faf9"><main style="max-width:30rem;margin:0 auto">${body}</main></body></html>`;
const HTML = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const t = (new URL(request.url).searchParams.get("t") ?? "").replace(/[^0-9a-f-]/gi, "");
        return new Response(
          page(`<h1 style="font-size:1.3rem">Stop RepSuites tips and reminders?</h1>
<p>You will still get emails you need, like receipts and private feedback from customers.</p>
<form method="post"><input type="hidden" name="t" value="${t}"><button style="background:#f5b324;color:#0f172a;border:0;border-radius:10px;padding:12px 18px;min-height:48px;font-weight:700;font-size:1.125rem;cursor:pointer">Yes, stop these emails</button></form>`),
          { status: 200, headers: HTML },
        );
      },
      POST: async ({ request }) => {
        const f = await request.formData().catch(() => null);
        const ok = await unsubscribe(String(f?.get("t") ?? ""));
        return new Response(
          page(
            ok
              ? `<h1 style="font-size:1.3rem">Done</h1><p>You will not get any more tips or reminders from RepSuites.</p>`
              : `<h1 style="font-size:1.3rem">That link has expired</h1><p>Reply to any RepSuites email and we will take you off the list.</p>`,
          ),
          { status: 200, headers: HTML },
        );
      },
    },
  },
});
