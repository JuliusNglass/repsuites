/* eslint-disable @typescript-eslint/no-explicit-any */
// Paystack webhook: https://repsuites.com/api/paystack/webhook
// Set this URL in Paystack: Settings > API Keys & Webhooks.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/paystack/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { verifyPaystackSignature, ngPaystackPaid } = await import("../lib/paystack.server");
        if (!(await verifyPaystackSignature(raw, request.headers.get("x-paystack-signature"))))
          return new Response("bad signature", { status: 401 });
        const ev = JSON.parse(raw) as { event?: string; data?: any };
        if (ev.event === "charge.success") await ngPaystackPaid(ev.data);
        return new Response("ok");
      },
    },
  },
});
