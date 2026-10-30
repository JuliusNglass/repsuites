// Printed RepSuites QR codes point here: /feedback/<ID>. Each ID belongs to
// one business (or one branch). Send the customer to that business's
// Google review page and count the scan.
import { createFileRoute } from "@tanstack/react-router";
import { serviceRead, serviceWrite } from "../lib/supabase-service.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/feedback/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = String(params.id || "").toLowerCase();
        if (UUID_RE.test(id)) {
          const r = await serviceRead<{ target_url: string }[]>(
            `qr_links?select=target_url&id=eq.${id}&active=eq.true`,
            "",
          );
          const target = r.data?.[0]?.target_url;
          if (target && target.startsWith("https://")) {
            await serviceWrite("qr_scans", "", { method: "POST", body: { qr_id: id } }).catch(
              () => null,
            );
            return new Response(null, {
              status: 302,
              headers: { Location: target, "Cache-Control": "no-store" },
            });
          }
        }
        return new Response(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RepSuites</title></head><body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center"><h1 style="font-size:1.4rem">Thanks for scanning</h1><p>This review code is not active at the moment. Please ask the business for their review link.</p><p><a href="/">RepSuites</a></p></body></html>`,
          {
            status: 404,
            headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
          },
        );
      },
    },
  },
});
