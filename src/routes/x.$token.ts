// Short opt-out link for texted review requests: repsuites.com/x/<token>
// goes to the existing one-tap unsubscribe page (/q/<token>?unsub=1).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/x/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token || "").replace(/[^A-Za-z0-9_-]/g, "");
        return new Response(null, {
          status: 302,
          headers: {
            Location: `/q/${encodeURIComponent(token)}?unsub=1`,
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
          },
        });
      },
    },
  },
});
