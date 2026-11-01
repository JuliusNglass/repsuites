// Status page for a Facebook data deletion request (/meta-deletion?code=...).
// No em dashes in this copy (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { deletionStatus } from "../lib/meta.server";

const page = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Data deletion | RepSuites</title></head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:0 auto;padding:40px 18px;line-height:1.5">
<h1 style="font-size:1.4rem">Facebook data deletion</h1>${body}
<p style="color:#64748b;font-size:1rem">Questions? Email support@repsuites.com.</p></body></html>`;

export const Route = createFileRoute("/meta-deletion")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const code = String(new URL(request.url).searchParams.get("code") ?? "");
        const s = await deletionStatus(code);
        const body = s
          ? `<p>Request <b>${code}</b>: ${s.done_at ? "done. We have deleted the Facebook and Instagram access and Page details we held for you." : "received. We are deleting your data."}</p>`
          : `<p>We could not find that request. If you removed RepSuites from Facebook, your access tokens are deleted automatically.</p>`;
        return new Response(page(body), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
