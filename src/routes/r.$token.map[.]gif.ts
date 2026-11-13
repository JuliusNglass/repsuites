// The moving map GIF for a report: /r/<token>/map.gif, used in emails.
import { createFileRoute } from "@tanstack/react-router";
import { serviceRead } from "../lib/supabase-service.server";
import { mapGif } from "../lib/map-gif";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export const Route = createFileRoute("/r/$token/map.gif")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!TOKEN_RE.test(token)) return new Response("Not found", { status: 404 });
        const r = await serviceRead<
          {
            report: {
              grids?: { ranks: (number | null)[] }[];
              grid?: { ranks: (number | null)[] };
            } | null;
          }[]
        >(`prospects?select=report&report_token=eq.${token}&limit=1`, "");
        const rep = r.data?.[0]?.report;
        const ranks = rep?.grids?.[0]?.ranks ?? rep?.grid?.ranks;
        if (!ranks || ranks.length !== 25) return new Response("Not found", { status: 404 });
        return new Response(new Blob([mapGif(ranks) as BlobPart], { type: "image/gif" }), {
          headers: { "Content-Type": "image/gif", "Cache-Control": "public, max-age=86400" },
        });
      },
    },
  },
});
