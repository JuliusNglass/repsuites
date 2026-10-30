// Stripe webhook: https://repsuites.com/api/stripe/webhook
import { createFileRoute } from "@tanstack/react-router";
import { handleStripeWebhook } from "../lib/stripe-webhook.server";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const status = await handleStripeWebhook(raw, request.headers.get("stripe-signature"));
        return new Response(status === 200 ? "ok" : "bad request", { status });
      },
    },
  },
});
