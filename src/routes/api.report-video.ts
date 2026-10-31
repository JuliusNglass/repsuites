// The report page (/r/<token>) tells us when its video plays and how far
// people watch. POST {t: token, e: "play" | "progress", p: 0 to 100}.
// Also "chat" (tapped WhatsApp) and "call" (tapped book a call).
// Our own team watching (signed in) and bots are not counted.
import { createFileRoute } from "@tanstack/react-router";
import { trackAction, trackVideo } from "../lib/prospect-video.server";
import { isLinkBot } from "../lib/link-bots";

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export const Route = createFileRoute("/api/report-video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if ((request.headers.get("cookie") ?? "").includes("repsuites_session=")) return done();
        if (isLinkBot(request.method, request.headers.get("user-agent"))) return done();
        const raw = await request.text().catch(() => "");
        if (raw.length > 300) return done();
        let j: { t?: unknown; e?: unknown; p?: unknown } = {};
        try {
          j = JSON.parse(raw) as typeof j;
        } catch {
          return done();
        }
        if ((j.e === "chat" || j.e === "call") && typeof j.t === "string") {
          await trackAction(j.t, j.e).catch(() => null);
          return done();
        }
        const e = j.e === "play" || j.e === "progress" ? j.e : null;
        const p = typeof j.p === "number" && Number.isFinite(j.p) ? j.p : 0;
        if (e && typeof j.t === "string") await trackVideo(j.t, e, p).catch(() => null);
        return done();
      },
    },
  },
});
