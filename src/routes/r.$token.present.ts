// Live call presentation from a prospect's free check: /r/<token>/present.
// Does not count as a report open. No em dashes in this copy (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { serviceRead } from "../lib/supabase-service.server";
import { reportNotFound } from "../lib/report-page.server";
import { renderPresentation } from "../lib/present-page.server";
import type { Report } from "../lib/prospects.server";

const HTML = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

export const Route = createFileRoute("/r/$token/present")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token || "");
        if (!/^[A-Za-z0-9_-]{20,64}$/.test(token))
          return new Response(reportNotFound(), { status: 404, headers: HTML });
        const r = await serviceRead<{ report: Report | null }[]>(
          `prospects?select=report&report_token=eq.${token}`,
          "",
        );
        const report = r.data?.[0]?.report;
        if (!report) return new Response(reportNotFound(), { status: 404, headers: HTML });
        return new Response(renderPresentation(report, token), { status: 200, headers: HTML });
      },
    },
  },
});
