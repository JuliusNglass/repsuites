// GET /api/growth-places?q=: business-name lookup for the SparkOps Growth survey
// (growth.accelur8clientwork.com). One Google Text Search returns name, town and
// website, so picking a match also fills the website field. Only the growth page
// origin may call it, so other sites cannot spend our Places quota.
import { createFileRoute } from "@tanstack/react-router";

const ORIGIN = "https://growth.accelur8clientwork.com";
const cors = { "Access-Control-Allow-Origin": ORIGIN, Vary: "Origin" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=300",
      ...cors,
    },
  });

export const Route = createFileRoute("/api/growth-places")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = request.headers.get("origin") ?? "";
        const referer = request.headers.get("referer") ?? "";
        if (origin !== ORIGIN && !referer.startsWith(ORIGIN + "/"))
          return json({ places: [] }, 403);
        const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
        if (q.length < 3 || q.length > 80) return json({ places: [] });
        const key = (process.env["REPSUITES_GOOGLE_MAPS_KEY"] ?? "").trim();
        if (!key) return json({ places: [] });
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 6000);
        try {
          const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            signal: ctl.signal,
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": key,
              "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,places.websiteUri",
            },
            body: JSON.stringify({ textQuery: q, regionCode: "gb", pageSize: 5 }),
          });
          if (!r.ok) {
            console.error("growth-places: search failed", r.status);
            return json({ places: [] });
          }
          const d = (await r.json().catch(() => ({}))) as {
            places?: {
              id?: string;
              displayName?: { text?: string };
              formattedAddress?: string;
              websiteUri?: string;
            }[];
          };
          const places = (d.places ?? [])
            .filter((p) => p.id && p.displayName?.text)
            .slice(0, 5)
            .map((p) => ({
              id: String(p.id).slice(0, 300),
              name: String(p.displayName?.text).slice(0, 160),
              detail: (p.formattedAddress ?? "").slice(0, 200),
              website: (p.websiteUri ?? "").slice(0, 300),
            }));
          // Text Search often misses service-area cleaners (no shop address);
          // Autocomplete finds them, so top up from it.
          if (places.length < 5) {
            const a = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
              method: "POST",
              signal: ctl.signal,
              headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
              body: JSON.stringify({ input: q, includedRegionCodes: ["gb"] }),
            }).catch(() => null);
            const aj = (a && a.ok ? await a.json().catch(() => ({})) : {}) as {
              suggestions?: {
                placePrediction?: {
                  placeId?: string;
                  structuredFormat?: {
                    mainText?: { text?: string };
                    secondaryText?: { text?: string };
                  };
                };
              }[];
            };
            for (const s of aj.suggestions ?? []) {
              const p = s.placePrediction;
              const name = p?.structuredFormat?.mainText?.text;
              if (!p?.placeId || !name || places.some((x) => x.id === p.placeId)) continue;
              places.push({
                id: p.placeId.slice(0, 300),
                name: name.slice(0, 160),
                detail: (p.structuredFormat?.secondaryText?.text ?? "").slice(0, 200),
                website: "",
              });
              if (places.length >= 5) break;
            }
          }
          return json({ places });
        } catch {
          return json({ places: [] });
        } finally {
          clearTimeout(t);
        }
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: { ...cors, "Access-Control-Allow-Methods": "GET" },
        }),
    },
  },
});
