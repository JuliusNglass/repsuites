// The shareable insight report: /r/<token>. Counts each view (unless the
// Accelur8 team is looking) so follow-ups can be timed.
import { createFileRoute } from "@tanstack/react-router";
import { serviceRead, serviceWrite } from "../lib/supabase-service.server";
import { renderReport, reportNotFound } from "../lib/report-page.server";
import type { Report } from "../lib/prospects.server";

const HTML = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

export const Route = createFileRoute("/r/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = String(params.token || "");
        if (!/^[A-Za-z0-9_-]{20,64}$/.test(token))
          return new Response(reportNotFound(), { status: 404, headers: HTML });
        const r = await serviceRead<{ report: Report | null }[]>(
          `prospects?select=report&report_token=eq.${token}`,
          "",
        );
        const report = r.data?.[0]?.report;
        if (!report) return new Response(reportNotFound(), { status: 404, headers: HTML });
        // Do not count our own team opening it (they are signed in).
        const ours = (request.headers.get("cookie") ?? "").includes("repsuites_session=");
        if (!ours)
          await serviceWrite("rpc/repsuites_report_opened", "", {
            method: "POST",
            body: { p_token: token },
          }).catch(() => null);
        return new Response(renderReport(report), { status: 200, headers: HTML });
      },
    },
  },
});
