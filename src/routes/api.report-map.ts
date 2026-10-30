/* eslint-disable @typescript-eslint/no-explicit-any -- stored report JSON */
// The map picture behind the pins on a shareable report (/r/<token>).
// Fetched from Google Static Maps on the server, so the key never reaches
// the browser. Cached for a week.
import { createFileRoute } from "@tanstack/react-router";
import { serviceRead } from "../lib/supabase-service.server";
import { zoomFor } from "../lib/report-map";
import { usesMiles } from "../lib/units";

const none = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export const Route = createFileRoute("/api/report-map")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const r = String(new URL(request.url).searchParams.get("r") ?? "");
        if (!/^[A-Za-z0-9_-]{20,64}$/.test(r)) return none();
        const key = (process.env["REPSUITES_GOOGLE_MAPS_KEY"] ?? "").trim();
        if (!key) return none();
        const p = await serviceRead<{ lat: number | null; lng: number | null; report: any }[]>(
          `prospects?select=lat,lng,report&report_token=eq.${r}`,
          "",
        );
        const row = p.data?.[0];
        const c =
          row?.report?.grid?.center ??
          (row?.lat != null && row?.lng != null ? { lat: row.lat, lng: row.lng } : null);
        if (!c) return none();
        const spacing = Number(row?.report?.grid?.spacingKm) || (usesMiles(c.lat, c.lng) ? 0.8 : 1);
        const q = new URLSearchParams({
          center: `${c.lat},${c.lng}`,
          zoom: String(zoomFor(c.lat, spacing)),
          size: "640x640",
          scale: "2",
          language: "en-GB",
          key,
        });
        try {
          const g = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${q}`, {
            signal: AbortSignal.timeout(15000),
          });
          const type = g.headers.get("content-type") ?? "";
          if (!g.ok || !type.startsWith("image/")) {
            console.error("[report-map]", g.status, (await g.text().catch(() => "")).slice(0, 200));
            return none();
          }
          return new Response(g.body, {
            status: 200,
            headers: {
              "Content-Type": type,
              "Cache-Control": "public, max-age=604800",
              "X-Robots-Tag": "noindex",
            },
          });
        } catch {
          return none();
        }
      },
    },
  },
});
