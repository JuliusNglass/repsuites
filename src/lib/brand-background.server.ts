// Server-only: the business background photo shared by the QR stand and the
// review cards on posts. Saved in public storage (Google must be able to
// fetch post pictures, and the browser must be able to draw it on a canvas).
import { getSupabaseConfig } from "./config.server";
import { getServiceKey, serviceRead, serviceWrite } from "./supabase-service.server";
import { styleAfterBackground } from "./card-style";

// Uploads picture bytes and returns the public link, or null on failure.
export async function storeBackground(
  tenantId: string,
  bytes: Uint8Array<ArrayBuffer>,
  type: "image/jpeg" | "image/png",
): Promise<string | null> {
  const cfg = getSupabaseConfig();
  const key = getServiceKey();
  if (!cfg.isConfigured || !key) return null;
  const path = `${tenantId}/background-${Date.now()}.${type === "image/png" ? "png" : "jpg"}`;
  const up = await fetch(`${cfg.url}/storage/v1/object/post-images/${path}`, {
    method: "POST",
    headers: {
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
      apikey: key,
      "Content-Type": type,
      "x-upsert": "true",
    },
    body: bytes,
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  return up?.ok ? `${cfg.url}/storage/v1/object/public/post-images/${path}` : null;
}

// Saves (or removes, with null) the background, moves the card style to the
// QR stand look when that makes sense, and has waiting cards drawn again.
export async function setBackground(
  tenantId: string,
  userId: string,
  url: string | null,
): Promise<boolean> {
  const cur = await serviceRead<{ card_style: string | null; stand_theme: string | null }[]>(
    `business_branding?select=card_style,stand_theme&tenant_id=eq.${tenantId}`,
    "",
  );
  const row = cur.data?.[0];
  const style = styleAfterBackground(row?.card_style ?? null, !!url, row?.stand_theme ?? null);
  const w = await serviceWrite("business_branding?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      tenant_id: tenantId,
      background_url: url,
      ...(style ? { card_style: style } : {}),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
  });
  if (w.error) return false;
  await serviceWrite(
    `google_posts?tenant_id=eq.${tenantId}&image_kind=eq.card&status=in.(draft,scheduled)`,
    "",
    { method: "PATCH", body: { image_url: null } },
  );
  return true;
}
