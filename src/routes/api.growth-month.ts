// Moved to SparkOps (27 Nov 2026). Old links and forms are sent on there,
// with the same query string (302 keeps a form post a post).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/growth-month")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        return new Response(null, {
          status: 302,
          headers: {
            Location: `https://ops.accelur8clientwork.com/api/growth-month${u.search}`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
