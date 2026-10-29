// Server-only: look up which business (if any) owns the web address the app
// was opened on. Domains live in public.tenant_domains (service key only).
import { getRequestHeader } from "@tanstack/react-start/server";
import { serviceRead } from "./supabase-service.server";
import { parseHostHeader, httpsOriginHost, type HostTenant } from "./tenant-domain";

interface DomainRow {
  domain: string;
  tenant_id: string;
  tenants: { name: string; settings: Record<string, unknown> | null } | null;
}

const CACHE_MS = 60_000;
const FAILED_CACHE_MS = 5_000;
let cache: { at: number; ttl: number; map: Map<string, HostTenant> } | null = null;

function logoFrom(settings: Record<string, unknown> | null | undefined): string | null {
  const branding = settings?.["branding"];
  if (!branding || typeof branding !== "object") return null;
  const url = (branding as Record<string, unknown>)["logo_url"];
  return typeof url === "string" && /^https:\/\//.test(url) ? url : null;
}

async function loadDomains(): Promise<Map<string, HostTenant>> {
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.map;
  const r = await serviceRead<DomainRow[]>(
    "tenant_domains?select=domain,tenant_id,tenants(name,settings)&active=eq.true",
    "",
  );
  const map = new Map<string, HostTenant>();
  if (!r.error && Array.isArray(r.data)) {
    for (const row of r.data) {
      const host = parseHostHeader(row.domain);
      if (!host || !row.tenant_id) continue;
      map.set(host, {
        tenantId: row.tenant_id,
        name: row.tenants?.name || "your business",
        logoUrl: logoFrom(row.tenants?.settings),
      });
    }
  }
  cache = { at: now, ttl: r.error ? FAILED_CACHE_MS : CACHE_MS, map };
  return map;
}

// For tests.
export function resetTenantDomainCache() {
  cache = null;
}

export function requestHostname(): string | null {
  return parseHostHeader(getRequestHeader("x-forwarded-host") || getRequestHeader("host"));
}

// The business that owns the current web address, or null on the shared app.
export async function resolveHostTenant(): Promise<HostTenant | null> {
  const host = requestHostname();
  if (!host) return null;
  const map = await loadDomains();
  return map.get(host) ?? null;
}

// True when the origin is https://<an active business domain>.
export async function isTenantDomainOrigin(origin: string): Promise<boolean> {
  const host = httpsOriginHost(origin);
  if (!host) return false;
  const map = await loadDomains();
  return map.has(host);
}
