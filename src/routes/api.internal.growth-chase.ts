// Internal: called by the database to chase qualified growth leads who have not booked a Fit Call. Every 10 minutes;
// follow-ups. Needs the x-repsuites-cron-token header.
import { createFileRoute } from "@tanstack/react-router";
import { runGrowthChase } from "../lib/growth-chase.server";

export const Route = createFileRoute("/api/internal/growth-chase")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-repsuites-cron-token") || "";
        const r =
          token.length < 32 ? { status: 401, body: { ok: false } } : await runGrowthChase(token);
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
