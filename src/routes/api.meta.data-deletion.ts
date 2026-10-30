// Meta's "data deletion request callback": called when someone removes the
// RepSuites app from their Facebook account. Returns Meta's required JSON.
import { createFileRoute } from "@tanstack/react-router";
import { handleDeletion } from "../lib/meta.server";

export const Route = createFileRoute("/api/meta/data-deletion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData().catch(() => null);
        const signed = String(form?.get("signed_request") ?? "").slice(0, 4000);
        const res = signed ? await handleDeletion(signed) : null;
        if (!res)
          return new Response(JSON.stringify({ error: "invalid signed_request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
