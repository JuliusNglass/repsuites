// Read and save a business's brand colours (hex codes).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { getServiceKey, serviceRead, serviceWrite } from "./supabase-service.server";
import { getSupabaseConfig } from "./config.server";
import { normaliseHex } from "./brand";

const EDITORS = ["owner", "admin", "super_admin", "manager"];

export const getBranding = createServerFn({ method: "GET" }).handler(async () => {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: "Sign in again." };
  const r = await serviceRead<
    {
      primary_hex: string | null;
      secondary_hex: string | null;
      logo_url: string | null;
      background_url: string | null;
      stand_theme: string | null;
      card_style: string | null;
    }[]
  >(
    `business_branding?select=primary_hex,secondary_hex,logo_url,background_url,stand_theme,card_style&tenant_id=eq.${g.session.active_tenant_id}`,
    "",
  );
  const b = r.data?.[0];
  return {
    ok: true as const,
    primary: b?.primary_hex ?? null,
    secondary: b?.secondary_hex ?? null,
    logo: b?.logo_url ?? null,
    background: b?.background_url ?? null,
    standTheme: b?.stand_theme ?? null,
    cardStyle: b?.card_style ?? null,
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

// Saves the business's logo (a PNG drawn in the browser, at most 800px wide)
// so review cards and the QR designer can use it. null removes it.
export const saveBrandLogo = createServerFn({ method: "POST" })
  .validator((d: { png: string | null }) =>
    z.object({ png: z.string().max(3_000_000).nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    const g = await requireProtectedRequest({ requireTenant: true });
    if (!g.ok) return { ok: false as const, error: "Sign in again." };
    if (!EDITORS.includes(g.session.role || ""))
      return { ok: false as const, error: "Access denied." };
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    const tenantId = g.session.active_tenant_id!;
    let url: string | null = null;
    if (data.png) {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(data.png);
      if (!m) return { ok: false as const, error: "That logo could not be read." };
      const bytes = Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0));
      if (bytes.length < 200 || bytes.length > 2_000_000)
        return { ok: false as const, error: "That logo is the wrong size." };
      const cfg = getSupabaseConfig();
      const key = getServiceKey();
      if (!cfg.isConfigured || !key) return { ok: false as const, error: "Storage is not set up." };
      const path = `${tenantId}/logo-${Date.now()}.png`;
      const up = await fetch(`${cfg.url}/storage/v1/object/post-images/${path}`, {
        method: "POST",
        headers: {
          ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
          apikey: key,
          "Content-Type": "image/png",
          "x-upsert": "true",
        },
        body: bytes,
        signal: AbortSignal.timeout(20000),
      }).catch(() => null);
      if (!up?.ok) return { ok: false as const, error: "Could not save the logo. Try again." };
      url = `${cfg.url}/storage/v1/object/public/post-images/${path}`;
    }
    const w = await serviceWrite("business_branding?on_conflict=tenant_id", "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: {
        tenant_id: tenantId,
        logo_url: url,
        updated_by: g.session.user_id,
        updated_at: new Date().toISOString(),
      },
    });
    if (w.error) return { ok: false as const, error: "Could not save the logo. Try again." };
    // Review cards on waiting posts are drawn again with the new logo.
    await serviceWrite(
      `google_posts?tenant_id=eq.${tenantId}&image_kind=eq.card&status=in.(draft,scheduled)`,
      "",
      { method: "PATCH", body: { image_url: null } },
    );
    return { ok: true as const, url };
  });

async function brandEditor() {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: "Sign in again." };
  if (!EDITORS.includes(g.session.role || ""))
    return { ok: false as const, error: "Access denied." };
  if (!(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Please refresh the page and try again." };
  return { ok: true as const, tenantId: g.session.active_tenant_id!, userId: g.session.user_id };
}

// Waiting review cards are drawn again (on the owner's screen) with the new look.
async function redrawCards(tenantId: string) {
  await serviceWrite(
    `google_posts?tenant_id=eq.${tenantId}&image_kind=eq.card&status=in.(draft,scheduled)`,
    "",
    { method: "PATCH", body: { image_url: null } },
  );
}

// Saves the QR stand's background photo (a JPEG drawn in the browser, at most
// 1600px wide) so review cards can use the same look. null removes it.
export const saveBrandBackground = createServerFn({ method: "POST" })
  .validator((d: { jpeg: string | null }) =>
    z.object({ jpeg: z.string().max(4_000_000).nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    const g = await brandEditor();
    if (!g.ok) return g;
    let url: string | null = null;
    if (data.jpeg) {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(data.jpeg);
      if (!m) return { ok: false as const, error: "That photo could not be read." };
      const bytes = Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0));
      if (bytes.length < 500 || bytes.length > 3_000_000)
        return { ok: false as const, error: "That photo is the wrong size." };
      const cfg = getSupabaseConfig();
      const key = getServiceKey();
      if (!cfg.isConfigured || !key) return { ok: false as const, error: "Storage is not set up." };
      const path = `${g.tenantId}/background-${Date.now()}.jpg`;
      const up = await fetch(`${cfg.url}/storage/v1/object/post-images/${path}`, {
        method: "POST",
        headers: {
          ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
          apikey: key,
          "Content-Type": "image/jpeg",
          "x-upsert": "true",
        },
        body: bytes,
        signal: AbortSignal.timeout(20000),
      }).catch(() => null);
      if (!up?.ok) return { ok: false as const, error: "Could not save the photo. Try again." };
      url = `${cfg.url}/storage/v1/object/public/post-images/${path}`;
    }
    const w = await serviceWrite("business_branding?on_conflict=tenant_id", "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: {
        tenant_id: g.tenantId,
        background_url: url,
        updated_by: g.userId,
        updated_at: new Date().toISOString(),
      },
    });
    if (w.error) return { ok: false as const, error: "Could not save the photo. Try again." };
    await redrawCards(g.tenantId);
    return { ok: true as const, url };
  });

// Saves the QR stand's colour theme and/or the review card style.
export const saveBrandLook = createServerFn({ method: "POST" })
  .validator((d: { standTheme?: string; cardStyle?: string }) =>
    z
      .object({
        standTheme: z
          .string()
          .regex(/^[a-z]{2,20}$/)
          .optional(),
        cardStyle: z
          .string()
          .regex(/^[a-z]{2,20}$/)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await brandEditor();
    if (!g.ok) return g;
    const w = await serviceWrite("business_branding?on_conflict=tenant_id", "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: {
        tenant_id: g.tenantId,
        ...(data.standTheme ? { stand_theme: data.standTheme } : {}),
        ...(data.cardStyle ? { card_style: data.cardStyle } : {}),
        updated_by: g.userId,
        updated_at: new Date().toISOString(),
      },
    });
    if (w.error) return { ok: false as const, error: "Could not save. Try again." };
    if (data.cardStyle) await redrawCards(g.tenantId);
    return { ok: true as const };
  });
