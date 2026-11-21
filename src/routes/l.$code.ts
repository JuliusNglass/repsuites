// Tracked link: logs the click, tags the GHL contact (clicked-<code>), then redirects.
import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_RE, target } from "../lib/track-links";

export const Route = createFileRoute("/l/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const u = new URL(request.url);
        const c = u.searchParams.get("c") ?? "";
        const contact = CONTACT_RE.test(c) ? c : null;
        const { recordClick } = await import("../lib/track-links.server");
        const first = await recordClick(params.code, contact).catch(() => null);
        const to = target(params.code, first) ?? "https://repsuites.com/go";
        return new Response(null, {
          status: 302,
          headers: { Location: to, "Cache-Control": "no-store" },
        });
      },
    },
  },
});
