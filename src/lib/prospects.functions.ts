// Lead generator server functions (Accelur8 team only).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import {
  agencyGuard,
  saveProspectReport,
  searchBusinesses,
  STAGES,
  type Report,
} from "./prospects.server";

const PLACE_RE = /^[A-Za-z0-9_-]{10,300}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const searchProspects = createServerFn({ method: "POST" })
  .validator((d: { q: string }) => z.object({ q: z.string().trim().min(3).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    const hits = await searchBusinesses(data.q);
    if (!hits)
      return { ok: false as const, error: "Google search is not available. Check the Maps key." };
    const known = hits.length
      ? await serviceRead<{ place_id: string }[]>(
          `prospects?select=place_id&place_id=in.(${hits.map((h) => `"${h.placeId}"`).join(",")})`,
          "",
        )
      : { data: [] };
    const have = new Set((known.data ?? []).map((k) => k.place_id));
    return { ok: true as const, hits: hits.map((h) => ({ ...h, saved: have.has(h.placeId) })) };
  });

export const buildProspectReport = createServerFn({ method: "POST" })
  .validator((d: { placeId: string; keyword?: string; niche?: boolean }) =>
    z
      .object({
        placeId: z.string().regex(PLACE_RE),
        keyword: z.string().trim().max(80).optional(),
        niche: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    return saveProspectReport(data.placeId, data.niche ? "niche" : "search", {
      createdBy: g.userId,
      ...(data.keyword ? { keyword: data.keyword } : {}),
    });
  });

export const listProspects = createServerFn({ method: "GET" }).handler(async () => {
  const g = await agencyGuard(false);
  if (!g.ok) return g;
  const r = await serviceRead<
    {
      id: string;
      name: string;
      town: string | null;
      phone: string | null;
      email: string | null;
      contact_name: string | null;
      stage: string;
      follow_up_on: string | null;
      notes: string | null;
      report: Report | null;
      report_token: string | null;
      opens: number;
      last_opened_at: string | null;
      gbp_connected_at: string | null;
      source: string;
      created_at: string;
    }[]
  >(
    "prospects?select=id,name,town,phone,email,contact_name,stage,follow_up_on,notes,report,report_token,opens,last_opened_at,gbp_connected_at,source,created_at&order=updated_at.desc&limit=300",
    "",
  );
  return {
    ok: true as const,
    prospects: (r.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      town: p.town ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      contactName: p.contact_name ?? "",
      stage: p.stage,
      followUpOn: p.follow_up_on,
      notes: p.notes ?? "",
      score: p.report?.score ?? null,
      topFix: p.report?.fixes?.[0]?.title ?? null,
      link: p.report_token ? `https://repsuites.com/r/${p.report_token}` : null,
      opens: p.opens,
      lastOpenedAt: p.last_opened_at,
      googleConnected: !!p.gbp_connected_at,
      source: p.source,
      createdAt: p.created_at,
    })),
  };
});

export const updateProspect = createServerFn({ method: "POST" })
  .validator(
    (d: {
      id: string;
      stage?: string;
      followUpOn?: string | null;
      notes?: string;
      email?: string;
      contactName?: string;
    }) =>
      z
        .object({
          id: z.string().regex(UUID_RE),
          stage: z.enum(STAGES).optional(),
          followUpOn: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable()
            .optional(),
          notes: z.string().max(4000).optional(),
          email: z.union([z.literal(""), z.string().trim().email().max(320)]).optional(),
          contactName: z.string().trim().max(120).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.stage) body["stage"] = data.stage;
    if (data.followUpOn !== undefined) body["follow_up_on"] = data.followUpOn;
    if (data.notes !== undefined) body["notes"] = data.notes || null;
    if (data.email !== undefined) body["email"] = data.email || null;
    if (data.contactName !== undefined) body["contact_name"] = data.contactName || null;
    const w = await serviceWrite<unknown>(`prospects?id=eq.${data.id}`, "", {
      method: "PATCH",
      body,
    });
    return w.error ? { ok: false as const, error: "Could not save." } : { ok: true as const };
  });
