// Internal: called every 30 minutes by the database to bring in new Google
// reviews and publish due Google posts. Needs the x-repsuites-cron-token header.
import { createFileRoute } from "@tanstack/react-router";
import { runGoogleSync } from "../lib/google-business.server";

export const Route = createFileRoute("/api/internal/google")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-repsuites-cron-token") || "";
        const r =
          token.length < 32 ? { status: 401, body: { ok: false } } : await runGoogleSync(token);
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
