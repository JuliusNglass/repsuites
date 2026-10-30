// Internal: called twice an hour by the database to run one due local
// ranking check. Needs the x-repsuites-cron-token header.
import { createFileRoute } from "@tanstack/react-router";
import { runRankChecks } from "../lib/rank-tracking.server";

export const Route = createFileRoute("/api/internal/rank-checks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-repsuites-cron-token") || "";
        const r =
          token.length < 32 ? { status: 401, body: { ok: false } } : await runRankChecks(token);
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
