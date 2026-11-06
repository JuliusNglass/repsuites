import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { agencyGuard } from "./prospects.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";

const UUID = z.string().uuid();
const HEX = z.string().regex(/^#[0-9a-f]{6}$/i);

export const getReportBranding = createServerFn({ method: "GET" }).handler(async () => {
  const guard = await agencyGuard(false);
  if (!guard.ok) return guard;
  const result = await serviceRead<any[]>(
    `agency_report_branding?select=agency_name,primary_hex,secondary_hex,logo_url,phone,email&user_id=eq.${guard.userId}`,
    "",
  );
  return { ok: true as const, branding: result.data?.[0] ?? null };
});

export const saveReportBranding = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        agencyName: z.string().trim().min(2).max(80),
        primaryHex: HEX,
        secondaryHex: HEX,
        logoUrl: z.union([z.string().trim().url().max(500), z.literal("")]),
        phone: z.string().trim().max(40),
        email: z.union([z.string().trim().email().max(200), z.literal("")]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const guard = await agencyGuard(true);
    if (!guard.ok) return guard;
    await serviceWrite("agency_report_branding?on_conflict=user_id", "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: {
        user_id: guard.userId,
        agency_name: data.agencyName,
        primary_hex: data.primaryHex,
        secondary_hex: data.secondaryHex,
        logo_url: data.logoUrl || null,
        phone: data.phone || null,
        email: data.email || null,
        updated_at: new Date().toISOString(),
      },
    });
    return { ok: true as const };
  });

export const listProspectActions = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ prospectId: UUID }).parse(input))
  .handler(async ({ data }) => {
    const guard = await agencyGuard(false);
    if (!guard.ok) return guard;
    const result = await serviceRead<any[]>(
      `prospect_actions?select=id,action_key,title,evidence,status,assigned_to,due_on,note,updated_at&prospect_id=eq.${data.prospectId}&order=created_at.asc`,
      "",
    );
    return { ok: true as const, actions: result.data ?? [] };
  });

export const syncProspectActions = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ prospectId: UUID }).parse(input))
  .handler(async ({ data }) => {
    const guard = await agencyGuard(true);
    if (!guard.ok) return guard;
    const prospect = await serviceRead<{ report: { fixes?: { title: string; why: string }[] } }[]>(
      `prospects?select=report&id=eq.${data.prospectId}`,
      "",
    );
    const fixes = prospect.data?.[0]?.report?.fixes ?? [];
    for (let index = 0; index < fixes.length; index++) {
      const fix = fixes[index]!;
      await serviceWrite("prospect_actions?on_conflict=prospect_id,action_key", "", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: {
          prospect_id: data.prospectId,
          action_key: `report-fix-${index + 1}`,
          title: fix.title.slice(0, 300),
          evidence: fix.why.slice(0, 1000),
        },
      });
    }
    return { ok: true as const, count: fixes.length };
  });

export const updateProspectAction = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        id: UUID,
        status: z.enum(["proposed", "approved", "in_progress", "completed", "rejected", "verified"]),
        assignedTo: z.string().trim().max(120).optional(),
        dueOn: z.union([z.string().date(), z.literal("")]).optional(),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const guard = await agencyGuard(true);
    if (!guard.ok) return guard;
    const now = new Date().toISOString();
    await serviceWrite(`prospect_actions?id=eq.${data.id}`, "", {
      method: "PATCH",
      body: {
        status: data.status,
        assigned_to: data.assignedTo || null,
        due_on: data.dueOn || null,
        note: data.note || null,
        ...(data.status === "approved" ? { approved_by: guard.userId, approved_at: now } : {}),
        ...(data.status === "completed" ? { completed_at: now } : {}),
        ...(data.status === "verified" ? { verified_at: now } : {}),
        updated_at: now,
      },
    });
    return { ok: true as const };
  });

