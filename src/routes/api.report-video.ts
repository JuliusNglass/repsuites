// The report page (/r/<token>) tells us when its video plays and how far
// people watch. POST {t: token, e: "play" | "progress", p: 0 to 100}.
// Our own team watching (signed in) is not counted.
import { createFileRoute } from "@tanstack/react-router";
import { trackVideo } from "../lib/prospect-video.server";

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export const Route = createFileRoute("/api/report-video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if ((request.headers.get("cookie") ?? "").includes("repsuites_session=")) return done();
        const raw = await request.text().catch(() => "");
        if (raw.length > 300) return done();
        let j: { t?: unknown; e?: unknown; p?: unknown } = {};
        try {
          j = JSON.parse(raw) as typeof j;
        } catch {
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
