// Internal: called every 10 minutes by the database when there is work:
// past customer campaigns that are running, and accounting connections due a
// check (nudged by a webhook, or the hourly check). Needs the
// x-repsuites-cron-token header. Stays under Cloudflare's 50 outgoing
// requests per request (free plan) by sharing one budget.
import { createFileRoute } from "@tanstack/react-router";
import { Budget } from "../lib/accounting";
import { runAccountingSync } from "../lib/accounting.server";
import { runCampaigns } from "../lib/campaigns.server";
import { serviceWrite } from "../lib/supabase-service.server";

async function run(token: string) {
  const ok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
    method: "POST",
    body: { p_token: token },
  });
  if (ok.error || ok.data !== true) return { status: 401, body: { ok: false } };
  // 50 allowed, 1 used by the token check, a few kept spare.
  const budget = new Budget(45);
  const campaigns = await runCampaigns(budget).catch(() => 0);
  const accounting = await runAccountingSync(budget).catch(() => ({ checked: 0, queued: 0 }));
  return { status: 200, body: { ok: true, campaigns, accounting, left: budget.left } };
}

export const Route = createFileRoute("/api/internal/review-automation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-repsuites-cron-token") || "";
        const r = token.length < 32 ? { status: 401, body: { ok: false } } : await run(token);
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
