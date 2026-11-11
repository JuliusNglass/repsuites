// Internal: called every 5 minutes by the database (only when a Fix-It Pack
// is waiting) to write and email any pack the thank-you page did not finish.
import { createFileRoute } from "@tanstack/react-router";
import { serviceWrite } from "../lib/supabase-service.server";

export const Route = createFileRoute("/api/internal/fixit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-repsuites-cron-token") || "";
        const json = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        if (token.length < 32) return json(401, { ok: false });
        const ok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
          method: "POST",
          body: { p_token: token },
        });
        if (ok.error || ok.data !== true) return json(401, { ok: false });
        const { runFixitQueue } = await import("../lib/fixit-pack.server");
        return json(200, await runFixitQueue());
      },
    },
  },
});
