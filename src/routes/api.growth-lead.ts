// Moved to SparkOps (27 Nov 2026). Old links and forms are sent on there,
// with the same query string (307 keeps a form post a post).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/growth-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const u = new URL(request.url);
        return new Response(null, {
          status: 307,
          headers: {
            Location: `https://ops.accelur8clientwork.com/api/growth-lead${u.search}`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
