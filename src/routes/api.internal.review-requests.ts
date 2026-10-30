// Internal: called every 10 minutes by the database to email due review
// requests. Needs the x-repsuites-cron-token header.
import { createFileRoute } from "@tanstack/react-router";
import { runEmailRequests } from "../lib/review-requests.server";

export const Route = createFileRoute("/api/internal/review-requests")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-repsuites-cron-token") || "";
        const r =
          token.length < 32 ? { status: 401, body: { ok: false } } : await runEmailRequests(token);
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
