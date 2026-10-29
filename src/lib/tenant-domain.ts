// Pure helpers for custom business domains. Client-safe (no server imports).
//
// A business can have its own web address (for example
// app.crystalcleancontracts.com). When the app is opened on that address it
// signs people straight into that business only: the sign-in page shows the
// business name, only that business's members can sign in, and the business
// switcher is hidden.

export interface HostTenant {
  tenantId: string;
  name: string;
  logoUrl: string | null;
}

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// Turn a Host / X-Forwarded-Host header value into a bare lower-case hostname.
// Takes the first value of a comma list, drops any port, and rejects anything
// that is not a plain DNS name.
export function parseHostHeader(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]!.trim().toLowerCase();
  if (!first || first.length > 253) return null;
  // IPv6 literals and anything with credentials or paths are not business domains.
  if (first.includes("[") || first.includes("@") || first.includes("/")) return null;
  const host = first.replace(/:\d+$/, "").replace(/\.$/, "");
  return HOST_RE.test(host) ? host : null;
}

// Hostname of an exact https origin such as "https://app.example.com".
// Returns null for anything that is not a bare https origin.
export function httpsOriginHost(origin: string | null | undefined): string | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (u.port) return null;
    if (u.pathname !== "/" || u.search || u.hash) return null;
    if (origin !== u.origin) return null;
    return parseHostHeader(u.hostname);
  } catch {
    return null;
  }
}

// On a business domain, only that business's memberships count.
export function restrictToHostTenant<T extends { tenant_id: string }>(
  memberships: T[],
  hostTenant: HostTenant | null,
): T[] {
  if (!hostTenant) return memberships;
  return memberships.filter((m) => m.tenant_id === hostTenant.tenantId);
}

export function notMemberMessage(hostTenant: HostTenant): string {
  return `This account does not have access to ${hostTenant.name}.`;
}
