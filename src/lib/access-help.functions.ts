// Server functions for "Access help" on the Settings tab: the manager email
// for every owner, and the Accelur8 tracker for agency users only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { isAccessStatus, type AccessStatus } from "./access-help";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function managerEmail(): string {
  return (process.env["REPSUITES_MANAGER_EMAIL"] ?? "").trim() || "julius@accelur8.com";
}

async function isAgency(userId: string): Promise<boolean> {
  const a = await serviceRead<{ user_id: string }[]>(
    `agency_users?select=user_id&user_id=eq.${userId}`,
    "",
  );
  return !!a.data?.length;
}

export const getAccessHelpFn = createServerFn({ method: "POST" }).handler(async () => {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: g.error || "Sign in again." };
  const agency = await isAgency(g.session.user_id);
  let tracker: {
    status: AccessStatus;
    requestedOn: string | null;
    videoOn: string | null;
    note: string;
  } | null = null;
  if (agency) {
    const r = await serviceRead<
      {
        status: string;
        requested_on: string | null;
        video_on: string | null;
        note: string | null;
      }[]
    >(
      `access_help?select=status,requested_on,video_on,note&tenant_id=eq.${g.session.active_tenant_id}`,
      "",
    );
    const row = r.data?.[0];
    tracker = {
      status: row && isAccessStatus(row.status) ? row.status : "not_started",
      requestedOn: row?.requested_on ?? null,
      videoOn: row?.video_on ?? null,
      note: row?.note ?? "",
    };
  }
  return { ok: true as const, managerEmail: managerEmail(), agency, tracker };
});

export const saveAccessHelpFn = createServerFn({ method: "POST" })
  .validator(
    (d: { status: string; requestedOn: string | null; videoOn: string | null; note: string }) =>
      z
        .object({
          status: z.string().refine(isAccessStatus),
          requestedOn: z.string().regex(DATE).nullable(),
          videoOn: z.string().regex(DATE).nullable(),
          note: z.string().max(1000),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    const g = await requireProtectedRequest({ requireTenant: true });
    if (!g.ok) return { ok: false as const, error: g.error || "Sign in again." };
    if (!(await isAgency(g.session.user_id)))
      return { ok: false as const, error: "For the Accelur8 team only." };
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    const w = await serviceWrite("access_help?on_conflict=tenant_id", "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: {
        tenant_id: g.session.active_tenant_id,
        status: data.status,
        requested_on: data.requestedOn,
        video_on: data.videoOn,
        note: data.note.trim() || null,
        updated_by: g.session.user_id,
        updated_at: new Date().toISOString(),
      },
    });
    return w.error ? { ok: false as const, error: "Could not save." } : { ok: true as const };
  });
