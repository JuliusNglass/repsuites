// The shareable insight report: /r/<token>. Counts each view (unless the
// Accelur8 team is looking) so follow-ups can be timed.
import { createFileRoute } from "@tanstack/react-router";
import { serviceRead, serviceWrite } from "../lib/supabase-service.server";
import { renderReport, reportNotFound } from "../lib/report-page.server";
import type { Report } from "../lib/prospects.server";
import type { ProspectSnapshot } from "../lib/prospect-connect.server";
import type { VideoKind } from "../lib/prospect-video";

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
        const r = await serviceRead<
          {
            report: Report | null;
            gbp_snapshot: ProspectSnapshot | null;
            lat: number | null;
            lng: number | null;
            contact_name: string | null;
            video_url: string | null;
            video_kind: VideoKind | null;
            og_image_url: string | null;
          }[]
        >(
          `prospects?select=report,gbp_snapshot,lat,lng,contact_name,video_url,video_kind,og_image_url&report_token=eq.${token}`,
          "",
        );
        const row = r.data?.[0];
        const report = row?.report;
        if (!report) return new Response(reportNotFound(), { status: 404, headers: HTML });
        // Do not count our own team opening it (they are signed in).
        const ours = (request.headers.get("cookie") ?? "").includes("repsuites_session=");
        if (!ours)
          await serviceWrite("rpc/repsuites_report_opened", "", {
            method: "POST",
            body: { p_token: token },
          }).catch(() => null);
        const q = new URL(request.url).searchParams;
        const flash = q.get("print") ? "print" : (q.get("google") ?? "");
        return new Response(
          renderReport(report, {
            token,
            snapshot: row?.gbp_snapshot ?? null,
            flash: flash.slice(0, 20),
            center: row?.lat != null && row?.lng != null ? { lat: row.lat, lng: row.lng } : null,
            video:
              row?.video_url && row.video_kind
                ? { kind: row.video_kind, url: row.video_url }
                : null,
            contactName: row?.contact_name ?? null,
            ogImage: row?.og_image_url ?? null,
          }),
          { status: 200, headers: HTML },
        );
      },
    },
  },
});
