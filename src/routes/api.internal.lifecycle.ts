// Internal: called once a day by the database to send follow-up emails (or,
// in preview mode, a list for Julius). Needs the x-repsuites-cron-token header.
import { createFileRoute } from "@tanstack/react-router";
import { runLifecycle } from "../lib/lifecycle.server";

export const Route = createFileRoute("/api/internal/lifecycle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-repsuites-cron-token") || "";
        const r =
          token.length < 32 ? { status: 401, body: { ok: false } } : await runLifecycle(token);
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
