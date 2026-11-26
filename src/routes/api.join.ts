// GET /api/join?c=<contactId>: the "join the call" link in Fit Call texts. Records that the
// lead tapped it (so they don't get the 3-minute nudge), then opens their Google Meet.
import { createFileRoute } from "@tanstack/react-router";

const FALLBACK = "https://growth.accelur8clientwork.com/booked";

export const Route = createFileRoute("/api/join")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const c = new URL(request.url).searchParams.get("c") ?? "";
        const { CONTACT_RE } = await import("../lib/track-links");
        const { pickAppointment, safeMeet } = await import("../lib/growth-join");
        const go = (to: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: to, "Cache-Control": "no-store" },
          });
        if (!CONTACT_RE.test(c)) return go(FALLBACK);
        const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
        const { crmFetch } = await import("../lib/crm-store.server");
        const r = await crmFetch(`/contacts/${c}/appointments`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: "2021-07-28",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);
        type Ev = {
          id: string;
          startTime?: string;
          deleted?: boolean;
          calendarId?: string;
          address?: string;
        };
        const events = r?.ok ? (((await r.json()) as { events?: Ev[] }).events ?? []) : [];
        const e = pickAppointment(events, new Date());
        const meet = safeMeet(e?.address);
        if (e) {
          const { serviceWrite } = await import("../lib/supabase-service.server");
          await serviceWrite("growth_join?on_conflict=appt_id", "", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates" },
            body: { appt_id: e.id, contact_id: c, joined_at: new Date().toISOString() },
          });
        }
        return go(meet ?? FALLBACK);
      },
    },
  },
});
