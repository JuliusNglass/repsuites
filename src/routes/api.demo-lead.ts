// For SparkOps' personalised demo link (ops.accelur8clientwork.com/demo/go?r=<token>).
// GET ?t=<report token> -> { ok, business } for free-check reports only.
// Returns nothing that is not already on the public report page.
import { createFileRoute } from "@tanstack/react-router";
import { serviceRead } from "../lib/supabase-service.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const Route = createFileRoute("/api/demo-lead")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t") ?? "";
        if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return json({ ok: false }, 400);
        const r = await serviceRead<
          { name: string | null; source: string | null; created_by: string | null }[]
        >(`prospects?select=name,source,created_by&report_token=eq.${t}`, "");
        const row = r.data?.[0];
        if (!row || row.source !== "inbound" || row.created_by || !row.name)
          return json({ ok: false }, 404);
        return json({ ok: true, business: row.name.slice(0, 80) });
      },
    },
  },
});
