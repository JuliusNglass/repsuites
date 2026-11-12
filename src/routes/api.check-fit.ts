// Free-check report page: "two quick questions" (team size, biggest
// headaches). POST {t: report token, s: size, h: headaches[]}. Tags the
// owner's GHL contact so the right follow-up runs: "fit-sparkops" starts the
// SparkOps call path, anything else stays on the Fix-It Pack path.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { serviceRead } from "../lib/supabase-service.server";
import { fitTags, HEADACHES, SIZES, WEEK_RUNS } from "../lib/ghl-lead";

const Body = z.object({
  t: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  s: z.enum(SIZES),
  h: z.array(z.enum(HEADACHES)).min(1).max(5),
  w: z.enum(WEEK_RUNS).nullable().optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const Route = createFileRoute("/api/check-fit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text().catch(() => "");
        if (raw.length > 500) return json({ ok: false }, 413);
        let parsed;
        try {
          parsed = Body.safeParse(JSON.parse(raw));
        } catch {
          return json({ ok: false }, 400);
        }
        if (!parsed.success) return json({ ok: false }, 400);
        const { t, s, h, w } = parsed.data;
        // Only free-check reports (inbound, no agency owner) have a lead to tag.
        const r = await serviceRead<
          { email: string | null; source: string | null; created_by: string | null }[]
        >(`prospects?select=email,source,created_by&report_token=eq.${t}`, "");
        const row = r.data?.[0];
        if (!row || row.source !== "inbound" || row.created_by || !row.email)
          return json({ ok: false }, 404);
        const tags = fitTags(s, h, w ?? null);
        const { addGhlTags } = await import("../lib/ghl-lead.server");
        await addGhlTags({ email: row.email, phone: null, tags }).catch(() => false);
        return json({ ok: true, sparkops: tags.includes("fit-sparkops"), app: w === "app" });
      },
    },
  },
});
