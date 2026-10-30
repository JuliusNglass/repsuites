// The businesses the signed-in person can open (their own, or all of them for
// agency staff), for the dashboard's business switcher.
import { createServerFn } from "@tanstack/react-start";
import { applyNoStoreHeaders, requireProtectedRequest } from "./auth.server";
import { getTenantMemberships } from "./memberships.server";
import { serviceRead } from "./supabase-service.server";

export const listMyBusinesses = createServerFn({ method: "GET" }).handler(async () => {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: false });
  if (!g.ok) return { ok: false as const, error: g.error };
  const m = await getTenantMemberships(g.session.access_token, g.session.user_id);
  const ids = [...new Set(m.memberships.map((x) => x.tenant_id))];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const r = await serviceRead<{ id: string; name: string }[]>(
      `tenants?select=id,name&id=in.(${chunk.join(",")})`,
      "",
    );
    for (const t of r.data ?? []) names.set(t.id, t.name);
  }
  const businesses = ids
    .map((id) => ({ id, name: names.get(id) ?? "Business" }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  // The open business's plan and Google link, for the welcome and upgrade cards.
  const activeId = g.session.active_tenant_id ?? null;
  let plan = "free";
  let googleConnected = false;
  if (activeId) {
    const [p, c] = await Promise.all([
      serviceRead<{ plan: string }[]>(`tenant_plans?select=plan&tenant_id=eq.${activeId}`, ""),
      serviceRead<{ status: string }[]>(
        `google_connections?select=status&tenant_id=eq.${activeId}`,
        "",
      ),
    ]);
    plan = p.data?.[0]?.plan ?? "free";
    // "Last seen" for follow-up emails (at most one write an hour).
    const { touchActivity } = await import("./lifecycle.server");
    await touchActivity(activeId, g.session.user_id);
    googleConnected = c.data?.[0]?.status === "connected";
  }
  return {
    ok: true as const,
    email: g.user?.email ?? null,
    activeId,
    plan,
    googleConnected,
    agency: m.memberships.some((x) => x.role === "super_admin"),
    businesses,
  };
});
