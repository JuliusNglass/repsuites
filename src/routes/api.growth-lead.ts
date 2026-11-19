// POST /api/growth-lead: the SparkOps Growth page form (growth.accelur8clientwork.com).
import { createFileRoute } from "@tanstack/react-router";

const GROWTH = "https://growth.accelur8clientwork.com";

export const Route = createFileRoute("/api/growth-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { validate, route, pushGhl, bookPageUrl } = await import("../lib/growth-lead");
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
          // Instant owner alert; never block the lead's redirect on it.
          try {
            const { leadAlert, ALERT_TO } = await import("../lib/growth-lead");
            const { sendEmail } = await import("../lib/email.server");
            const a = leadAlert(d, r);
            const sent = await sendEmail({
              to: ALERT_TO,
              fromName: "Lead alert",
              replyTo: d.email,
              ...a,
            });
            if (!sent.ok) console.error("growth lead: alert failed", sent.error);
          } catch (e) {
            console.error("growth lead: alert error", e);
          }
          return go(bookPageUrl(d));
        }
        return go(`${GROWTH}/thanks${r.solo ? "?s=1" : ""}`);
      },
    },
  },
});
