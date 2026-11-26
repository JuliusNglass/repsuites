// GET /api/growth-month?c=<contactId>&m=YYYY-MM: a growth lead picks the month they want to start.
import { createFileRoute } from "@tanstack/react-router";

const GROWTH = "https://growth.accelur8clientwork.com";

export const Route = createFileRoute("/api/growth-month")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const c = u.searchParams.get("c") ?? "";
        const m = u.searchParams.get("m") ?? "";
        const first = (u.searchParams.get("first_name") ?? "").slice(0, 40);
        const { CONTACT_RE } = await import("../lib/track-links");
        const { validMonth, monthTag } = await import("../lib/growth-month");
        const go = (to: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: to, "Cache-Control": "no-store" },
          });
        if (!CONTACT_RE.test(c) || !validMonth(m, new Date())) return go(`${GROWTH}/start?e=1`);
        const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
        const { crmFetch } = await import("../lib/crm-store.server");
        const r = await crmFetch(`/contacts/${c}/tags`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Version: "2021-07-28",
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            tags: [monthTag(m), "grw-month-picked", "grw-future", "nurture", "nurture-12m"],
          }),
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);
        if (!r?.ok) console.error("growth month: tag failed", r?.status);
        return go(
          `${GROWTH}/start/done?m=${m}${first ? `&first_name=${encodeURIComponent(first)}` : ""}`,
        );
      },
    },
  },
});
