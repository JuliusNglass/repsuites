// Internal: called by the database every 15 minutes to sync won GHL deals (Meta Purchase,
// customer tag, owner alert). Needs the x-repsuites-cron-token header.
import { createFileRoute } from "@tanstack/react-router";
import { runSaleSync } from "../lib/sale-sync.server";

export const Route = createFileRoute("/api/internal/sale-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-repsuites-cron-token") || "";
        const r =
          token.length < 32 ? { status: 401, body: { ok: false } } : await runSaleSync(token);
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
