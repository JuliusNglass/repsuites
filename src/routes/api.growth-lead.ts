// POST /api/growth-lead: the SparkOps Growth page form (growth.accelur8clientwork.com).
import { createFileRoute } from "@tanstack/react-router";

const GROWTH = "https://growth.accelur8clientwork.com";

export const Route = createFileRoute("/api/growth-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { validate, route, pushGhl } = await import("../lib/growth-lead");
        const go = (to: string) => new Response(null, { status: 303, headers: { Location: to } });
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return go(`${GROWTH}/?e=1#apply`);
        }
        const d = validate(form);
        if (!d) return go(`${GROWTH}/?e=1#apply`);
        if (d.trap) return go(`${GROWTH}/thanks`);
        const r = route(d);
        const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
        const saved = token ? await pushGhl(token, d, r) : false;
        if (!saved) console.error("growth lead: GHL upsert failed");
        // Also record the lead in the Accelur8 SparkOps account (no auto chase,
        // so it never doubles up with the GHL follow-ups).
        const { sendHqEvent } = await import("../lib/hq.server");
        await sendHqEvent({
          event: "lead_captured",
          idempotency_key: `growth:${d.email || d.phone}:${new Date().toISOString().slice(0, 13)}`,
          contact: { email: d.email || null, phone: d.phone || null, name: String(d.name) },
          company: { name: d.business || null },
          data: {
            form: "growth",
            qualified: r.qualified,
            urgent: r.urgent,
            phase: r.phaseKey,
            timing: (d as { timing?: string }).timing ?? null,
          },
        });
        if (d.eid) {
          const { sendMetaEvent } = await import("../lib/meta-capi.server");
          const ok = await sendMetaEvent({
            name: r.qualified ? "Lead" : "LeadUnqualified",
            eventId: d.eid,
            url: request.headers.get("referer") || `${GROWTH}/`,
            email: d.email,
            phone: d.phone,
            firstName: String(d.name).split(/\s+/)[0] ?? null,
            ip: request.headers.get("cf-connecting-ip"),
            userAgent: request.headers.get("user-agent"),
            fbp: d.fbp || null,
            fbc: d.fbc || null,
          });
          if (!ok) console.error("growth lead: Meta CAPI failed");
        }
        if (r.qualified) {
          // Funnel v4 (24 Nov 2026): the growth page shows the offer video (with
          // the cost) before the form. "Ready now" goes straight to booking;
          // "3 months" or "researching" goes to the Why wait page.
          const [first, ...rest] = String(d.name).split(/\s+/);
          const q = new URLSearchParams({
            first_name: first ?? "",
            last_name: rest.join(" "),
            email: d.email,
            phone: d.phone,
            ...(saved ? { c: saved } : {}),
          });
          const page =
            r.phaseKey === "hiring"
              ? "hiring"
              : r.phaseKey === "rebook"
                ? "reactivation"
                : "commercial";
          if (page === "commercial") {
            if (r.urgent) return go(`${GROWTH}/book?${q}`);
            q.set("o", "commercial");
            return go(`${GROWTH}/why?${q}`);
          }
          return go(`${GROWTH}/${page}?${q}`);
        }
        return go(`${GROWTH}/thanks?s=1`);
      },
    },
  },
});
