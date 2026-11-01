// Resend webhook: email.bounced and email.complained, signed with Svix
// (REPSUITES_RESEND_WEBHOOK_SECRET). Bounces stop that request and count
// towards a past customer campaign's automatic stop; complaints unsubscribe.
import { createFileRoute } from "@tanstack/react-router";
import { verifySvixSignature } from "../lib/accounting";
import { recordEmailEvent } from "../lib/campaigns.server";

export const Route = createFileRoute("/api/resend/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = (process.env["REPSUITES_RESEND_WEBHOOK_SECRET"] ?? "").trim();
        const raw = await request.text().catch(() => "");
        const ok =
          !!secret &&
          raw.length < 200000 &&
          (await verifySvixSignature(
            raw,
            {
              id: request.headers.get("svix-id"),
              timestamp: request.headers.get("svix-timestamp"),
              signature: request.headers.get("svix-signature"),
            },
            secret,
          ));
        if (!ok) return new Response(null, { status: 401 });
        try {
          const body = JSON.parse(raw) as { type?: unknown; data?: { email_id?: unknown } };
          if (typeof body.type === "string" && typeof body.data?.email_id === "string")
            await recordEmailEvent(body.type, body.data.email_id);
        } catch {
          // ignore bad JSON
        }
        return new Response(null, { status: 200 });
      },
    },
  },
});
