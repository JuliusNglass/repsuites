// POST /api/crm-tag { email?, phone?, tags[] }: SparkOps tells Accelur8's own
// contact store (crm_contacts) that a lead booked or replied, so the growth
// follow-up texts stop. Only stop/booked tags are accepted, so the worst a
// stranger could do is stop a follow-up early.
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED = new Set([
  "grw-booked",
  "sparkops-booked",
  "grw-confirmed",
  "replied",
  "no-followup",
]);

export const Route = createFileRoute("/api/crm-tag")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const b = (await request.json().catch(() => null)) as {
          email?: unknown;
          phone?: unknown;
          tags?: unknown;
        } | null;
        const tags = Array.isArray(b?.tags)
          ? b!.tags.map(String).filter((t) => ALLOWED.has(t))
          : [];
        const email = typeof b?.email === "string" ? b.email.slice(0, 200) : null;
        const phone = typeof b?.phone === "string" ? b.phone.slice(0, 30) : null;
        if (!tags.length || (!email && !phone))
          return Response.json({ ok: false }, { status: 400 });
        const { findContact, addTags } = await import("../lib/crm-store.server");
        const c = await findContact(email, phone);
        if (!c) return Response.json({ ok: true, found: false });
        return Response.json({ ok: await addTags(c.id, tags) });
      },
    },
  },
});
