// Read and save a business's brand colours (hex codes).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { normaliseHex } from "./brand";

const EDITORS = ["owner", "admin", "super_admin", "manager"];

export const getBranding = createServerFn({ method: "GET" }).handler(async () => {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: "Sign in again." };
  const r = await serviceRead<{ primary_hex: string | null; secondary_hex: string | null }[]>(
    `business_branding?select=primary_hex,secondary_hex&tenant_id=eq.${g.session.active_tenant_id}`,
    "",
  );
  return {
    ok: true as const,
    primary: r.data?.[0]?.primary_hex ?? null,
    secondary: r.data?.[0]?.secondary_hex ?? null,
  };
});

export const saveBranding = createServerFn({ method: "POST" })
  .validator((d: { primary: string | null; secondary: string | null }) =>
    z
      .object({
        primary: z.string().max(9).nullable(),
        secondary: z.string().max(9).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    const g = await requireProtectedRequest({ requireTenant: true });
    if (!g.ok) return { ok: false as const, error: "Sign in again." };
    if (!EDITORS.includes(g.session.role || ""))
      return { ok: false as const, error: "Access denied." };
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    const primary = data.primary ? normaliseHex(data.primary) : null;
    const secondary = data.secondary ? normaliseHex(data.secondary) : null;
    if ((data.primary && !primary) || (data.secondary && !secondary))
      return { ok: false as const, error: "Use a hex code like #0b1d3a." };
    const w = await serviceWrite("business_branding?on_conflict=tenant_id", "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: {
        tenant_id: g.session.active_tenant_id,
        primary_hex: primary,
        secondary_hex: secondary,
        updated_by: g.session.user_id,
        updated_at: new Date().toISOString(),
      },
    });
    return w.error
      ? { ok: false as const, error: "Could not save the colours." }
      : { ok: true as const, primary, secondary };
  });
