// Internal: called every hour by the database to send free Google Check
// follow-ups. Needs the x-repsuites-cron-token header.
import { createFileRoute } from "@tanstack/react-router";
import { runCheckFollowups } from "../lib/check-followups.server";

export const Route = createFileRoute("/api/internal/check-followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-repsuites-cron-token") || "";
        const r =
          token.length < 32 ? { status: 401, body: { ok: false } } : await runCheckFollowups(token);
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
