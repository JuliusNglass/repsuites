// Google sends the business owner back here after they allow access to
// their Business Profile. Then back to the Reviews page on their own address.
import { createFileRoute } from "@tanstack/react-router";
import { finishGoogleConnect } from "../lib/google-business.server";

export const Route = createFileRoute("/api/google/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const to = await finishGoogleConnect(new URL(request.url).searchParams);
        return new Response(null, {
          status: 302,
          headers: { Location: to, "Cache-Control": "no-store" },
        });
      },
    },
  },
});
