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
        const { sendHqEventReply, bookToken, plusPhone } = await import("../lib/hq.server");
        const reply = await sendHqEventReply({
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
        // "Later" leads start the 12-month lessons in SparkOps straight away.
        if (r.later) {
          const { startAccelur8Nurture } = await import("../lib/hq.server");
          await startAccelur8Nurture({
            name: String(d.name),
            email: d.email || null,
            phone: d.phone || null,
          });
        }
        // Their own SparkOps booking link: kept for the follow-up texts and
        // passed to the growth pages as b=, so booking happens in SparkOps.
        const b = bookToken(reply?.["book"]);
        if (b) {
          const { serviceWrite } = await import("../lib/supabase-service.server");
          await serviceWrite("growth_booking", "", {
            method: "POST",
            body: {
              email: d.email ? d.email.toLowerCase() : null,
              phone: plusPhone(d.phone),
              book_url: reply!["book"],
            },
          }).catch(() => undefined);
        }
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
            ...(b ? { b } : {}),
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
