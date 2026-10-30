// The business's printed QR codes (review cards, table stands) and how often
// each was scanned, for the dashboard.
import { createServerFn } from "@tanstack/react-start";
import { applyNoStoreHeaders, requireProtectedRequest } from "./auth.server";
import { serviceRead } from "./supabase-service.server";
import { tenantKind } from "./business-type";

export const getMyQrCodes = createServerFn({ method: "GET" }).handler(async () => {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: g.error || "Sign in again." };
  const tenantId = g.session.active_tenant_id!;
  const links = await serviceRead<
    {
      id: string;
      kind: string;
      location_name: string | null;
      target_url: string | null;
      active: boolean;
    }[]
  >(
    `qr_links?select=id,kind,location_name,target_url,active&tenant_id=eq.${tenantId}&order=kind.asc,location_name.asc`,
    "",
  );
  const tenant = await serviceRead<{ name: string | null; settings: unknown }[]>(
    `tenants?select=name,settings&id=eq.${tenantId}`,
    "",
  );
  const hospitality = tenantKind(tenant.data?.[0] ?? {}) === "hospitality";
  const ids = (links.data ?? []).map((l) => l.id);
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const counts = new Map<string, number>();
  if (ids.length) {
    const scans = await serviceRead<{ qr_id: string }[]>(
      `qr_scans?select=qr_id&qr_id=in.(${ids.join(",")})&scanned_at=gte.${since}&limit=10000`,
      "",
    );
    for (const s of scans.data ?? []) counts.set(s.qr_id, (counts.get(s.qr_id) ?? 0) + 1);
  }
  return {
    ok: true as const,
    hospitality,
    codes: (links.data ?? []).map((l) => ({
      id: l.id,
      label: l.kind === "location" ? l.location_name || "Branch" : "Main code",
      url: `https://www.repsuites.com/feedback/${l.id}`,
      working: l.active && !!l.target_url,
      scans30: counts.get(l.id) ?? 0,
    })),
  };
});
