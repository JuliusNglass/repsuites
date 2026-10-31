// The shareable insight report: /r/<token>. Counts each view so follow-ups
// can be timed, but not our own team (signed in), link-preview bots, or any
// view before the message was sent (the database checks that).
import { createFileRoute } from "@tanstack/react-router";
import { serviceRead, serviceWrite } from "../lib/supabase-service.server";
import { renderReport, reportNotFound } from "../lib/report-page.server";
import type { Report } from "../lib/prospects.server";
import type { ProspectSnapshot } from "../lib/prospect-connect.server";
import type { VideoKind } from "../lib/prospect-video";
import { isLinkBot } from "../lib/link-bots";

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
            min_sale_pence: number | null;
            sale_period: string | null;
          }[]
        >(
          `prospects?select=report,gbp_snapshot,lat,lng,contact_name,video_url,video_kind,og_image_url,min_sale_pence,sale_period&report_token=eq.${token}`,
          "",
        );
        const row = r.data?.[0];
        const report = row?.report;
        if (!report) return new Response(reportNotFound(), { status: 404, headers: HTML });
        // Do not count our own team opening it (they are signed in).
        const ours = (request.headers.get("cookie") ?? "").includes("repsuites_session=");
        const bot = isLinkBot(request.method, request.headers.get("user-agent"));
        if (!ours && !bot)
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
            minSalePence: row?.min_sale_pence ?? null,
            salePeriod: row?.sale_period ?? null,
          }),
          { status: 200, headers: HTML },
        );
      },
    },
  },
});
