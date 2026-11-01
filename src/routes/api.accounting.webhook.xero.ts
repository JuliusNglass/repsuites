// Xero webhook (INVOICE events). The x-xero-signature header is checked
// against XERO_WEBHOOK_KEY. Answers exactly 200 or 401, as Xero's "intent to
// receive" check needs. A valid call only asks for that organisation's
// invoices to be checked on the next run.
import { createFileRoute } from "@tanstack/react-router";
import { handleXeroWebhook } from "../lib/accounting.server";

export const Route = createFileRoute("/api/accounting/webhook/xero")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text().catch(() => "");
        const status =
          raw.length > 200000
            ? 401
            : await handleXeroWebhook(raw, request.headers.get("x-xero-signature"));
        return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
