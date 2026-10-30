// Dashboard: the business's review sites (the buttons on its QR feedback
// page, in order) and the private feedback customers have sent.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLATFORMS = [
  "google",
  "facebook",
  "tripadvisor",
  "trustpilot",
  "yelp",
  "booking",
  "other",
] as const;
const EDITORS = ["owner", "admin", "super_admin", "manager"];
const MAX_LINKS = 6;

async function guard(write: boolean) {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: g.error || "Sign in again." };
  if (!EDITORS.includes(g.session.role || ""))
    return { ok: false as const, error: "Access denied." };
  if (write && !(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Invalid request origin" };
  return { ok: true as const, tenantId: g.session.active_tenant_id! };
}

export const getReviewLinks = createServerFn({ method: "GET" }).handler(async () => {
  const g = await guard(false);
  if (!g.ok) return g;
  const [links, fb] = await Promise.all([
    serviceRead<
      { id: string; platform: string; label: string | null; url: string; position: number }[]
    >(
      `review_links?select=id,platform,label,url,position&tenant_id=eq.${g.tenantId}&active=eq.true&order=position.asc,created_at.asc`,
      "",
    ),
    serviceRead<
      {
        id: string;
        name: string | null;
        contact: string | null;
        message: string;
        created_at: string;
        read_at: string | null;
      }[]
    >(
      `private_feedback?select=id,name,contact,message,created_at,read_at&tenant_id=eq.${g.tenantId}&order=created_at.desc&limit=50`,
      "",
    ),
  ]);
  return {
    ok: true as const,
    max: MAX_LINKS,
    links: (links.data ?? []).map((l) => ({
      id: l.id,
      platform: l.platform as (typeof PLATFORMS)[number],
      label: l.label ?? "",
      url: l.url,
    })),
    feedback: fb.data ?? [],
  };
});

const LinkInput = z.object({
  platform: z.enum(PLATFORMS),
  label: z.string().trim().max(60).optional().default(""),
  url: z
    .string()
    .trim()
    .max(600)
    .url()
    .refine((u) => u.startsWith("https://"), "Use a link starting with https://"),
});

// Replace the whole list in the order given (first = the big button).
export const saveReviewLinks = createServerFn({ method: "POST" })
  .validator((data: { links: z.input<typeof LinkInput>[] }) =>
    z.object({ links: z.array(LinkInput).max(MAX_LINKS) }).parse(data),
  )
  .handler(async ({ data }) => {
    const g = await guard(true);
    if (!g.ok) return g;
    const seen = new Set<string>();
    const rows = data.links
      .filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)))
      .map((l, i) => ({
        tenant_id: g.tenantId,
        platform: l.platform,
        label: l.platform === "other" ? l.label || null : null,
        url: l.url,
        position: i,
      }));
    const del = await serviceWrite<unknown>(`review_links?tenant_id=eq.${g.tenantId}`, "", {
      method: "DELETE",
    });
    if (del.error) return { ok: false as const, error: "Could not save. Try again." };
    if (rows.length) {
      const ins = await serviceWrite<unknown>("review_links", "", { method: "POST", body: rows });
      if (ins.error) return { ok: false as const, error: "Could not save. Try again." };
    }
    return { ok: true as const };
  });

export const markFeedbackRead = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => z.object({ id: z.string().regex(UUID_RE) }).parse(data))
  .handler(async ({ data }) => {
    const g = await guard(true);
    if (!g.ok) return g;
    await serviceWrite<unknown>(
      `private_feedback?id=eq.${data.id}&tenant_id=eq.${g.tenantId}&read_at=is.null`,
      "",
      { method: "PATCH", body: { read_at: new Date().toISOString() } },
    );
    return { ok: true as const };
  });
