// Internal: called hourly on the 4th to 6th of each month by the database to
// email each business its monthly Google report. Needs the
// x-repsuites-cron-token header.
import { createFileRoute } from "@tanstack/react-router";
import { runGoogleReports } from "../lib/google-business.server";

export const Route = createFileRoute("/api/internal/google-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-repsuites-cron-token") || "";
        const r =
          token.length < 32 ? { status: 401, body: { ok: false } } : await runGoogleReports(token);
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
