// QuickBooks Online webhook (Invoice and Payment). The intuit-signature
// header is checked against QUICKBOOKS_WEBHOOK_VERIFIER; a valid call only
// asks for that company's invoices to be checked on the next run.
import { createFileRoute } from "@tanstack/react-router";
import { handleQuickBooksWebhook } from "../lib/accounting.server";

export const Route = createFileRoute("/api/accounting/webhook/quickbooks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text().catch(() => "");
        const status =
          raw.length > 200000
            ? 413
            : await handleQuickBooksWebhook(raw, request.headers.get("intuit-signature"));
        return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
