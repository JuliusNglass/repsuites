// Internal: video order jobs. The database calls it every 30 minutes with
// {"action":"reminders"}. The render task calls {"action":"queue"} to get
// approved orders and {"action":"mark","id","status","url"} when it starts or
// finishes one. Needs the x-repsuites-cron-token header.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { serviceWrite } from "../lib/supabase-service.server";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reminders") }),
  z.object({ action: z.literal("queue") }),
  z.object({
    action: z.literal("mark"),
    id: z.string().uuid(),
    status: z.enum(["rendering", "ready"]),
    url: z.string().url().max(500).optional(),
  }),
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const Route = createFileRoute("/api/internal/video-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-repsuites-cron-token") || "";
        if (token.length < 32) return json({ ok: false }, 401);
        const ok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
          method: "POST",
          body: { p_token: token },
        });
        if (ok.error || ok.data !== true) return json({ ok: false }, 401);
        const b = Body.safeParse(await request.json().catch(() => null));
        if (!b.success) return json({ ok: false, error: "bad body" }, 400);
        const v = await import("../lib/video-script.server");
        if (b.data.action === "reminders")
          return json({ ok: true, ...(await v.runVideoReminders()) });
        if (b.data.action === "queue") return json({ ok: true, orders: await v.renderQueue() });
        return json({ ok: await v.markRender(b.data.id, b.data.status, b.data.url) });
      },
    },
  },
});
