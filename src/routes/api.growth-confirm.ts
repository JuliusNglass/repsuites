// GET /api/growth-confirm?c=<contactId>: a booked growth lead taps "Yes, keep my spot"
// on the confirmation page. Tags them grw-confirmed (the same tag a YES text reply adds),
// but only if they really have a booked call.
import { createFileRoute } from "@tanstack/react-router";

const GROWTH = "https://growth.accelur8clientwork.com";
const GHL = "https://services.leadconnectorhq.com";

export const Route = createFileRoute("/api/growth-confirm")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const c = u.searchParams.get("c") ?? "";
        const first = (u.searchParams.get("first_name") ?? "").slice(0, 40);
        const { CONTACT_RE } = await import("../lib/track-links");
        const go = (ok: boolean) =>
          new Response(null, {
            status: 302,
            headers: {
              Location: `${GROWTH}/booked/done?ok=${ok ? 1 : 0}${first ? `&first_name=${encodeURIComponent(first)}` : ""}`,
              "Cache-Control": "no-store",
            },
          });
        if (!CONTACT_RE.test(c)) return go(false);
        const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
        const headers = {
          Authorization: `Bearer ${token}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        const got = await fetch(`${GHL}/contacts/${c}`, {
          headers,
          signal: AbortSignal.timeout(8000),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        const tags: string[] = got?.contact?.tags ?? [];
        if (!tags.includes("grw-booked")) return go(false);
        const r = await fetch(`${GHL}/contacts/${c}/tags`, {
          method: "POST",
          headers,
          body: JSON.stringify({ tags: ["grw-confirmed"] }),
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);
        if (!r?.ok) console.error("growth confirm: tag failed", r?.status);
        return go(!!r?.ok);
      },
    },
  },
});
