/* eslint-disable @typescript-eslint/no-explicit-any -- provider JSON is checked field by field. */
// Server-only: QuickBooks Online, Xero and FreeAgent connections. When an
// invoice is paid, the customer gets a review request through the same queue
// as the Ask tab (queueRequests), with event invoice_paid and external_id
// provider:invoice so the same invoice never asks twice.
//
// - Connect: OAuth 2.0 authorization code flow on repsuites.com with a sealed
//   state. Access and refresh tokens are kept in Supabase Vault, never in a
//   table and never sent to the browser.
// - Detect: QuickBooks and Xero webhooks (signature checked) only nudge the
//   connection to be checked now. The check itself reads invoices changed
//   since a saved cursor, oldest first. Every connection is also checked
//   hourly (FreeAgent has no webhooks, so that is how it works).
// - Cloudflare free plan: 50 outgoing requests per incoming request, so work
//   takes from a Budget and the cursor saves where it got to.
// Needs <PROVIDER>_CLIENT_ID and <PROVIDER>_CLIENT_SECRET; without them the
// Connect button says "Coming soon". No em dashes in copy.
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { getSupabaseConfig } from "./config.server";
import { decryptSessionData, encryptSessionData } from "./session.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { SHARED_ORIGIN } from "./tenant-links.server";
import {
  Budget,
  connectionError,
  freeAgentCustomer,
  freeAgentPaid,
  invoiceCap,
  invoiceToRequest,
  isProvider,
  nextCursor,
  oldestFirst,
  PROVIDER_NAMES,
  PROVIDERS,
  quickBooksCustomer,
  quickBooksPaid,
  quickBooksRealms,
  verifyQuickBooksSignature,
  verifyXeroSignature,
  xeroCustomer,
  xeroPaid,
  xeroTenants,
  type Customer,
  type PaidInvoice,
  type Provider,
} from "./accounting";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNERS = ["owner", "admin", "super_admin", "manager"];
const STATE_MAX_AGE_MS = 30 * 60 * 1000;
const HOUR = 3600000;

export const callbackPath = (p: Provider) => `/api/accounting/callback/${p}`;
export const callbackUrl = (p: Provider) => `${SHARED_ORIGIN}${callbackPath(p)}`;
export const webhookUrl = (p: "quickbooks" | "xero") =>
  `${SHARED_ORIGIN}/api/accounting/webhook/${p}`;

const env = (k: string) => (process.env[k] ?? "").trim();

const ENV_PREFIX: Record<Provider, string> = {
  quickbooks: "QUICKBOOKS",
  xero: "XERO",
  freeagent: "FREEAGENT",
};

function app(p: Provider): { id: string; secret: string } | null {
  const id = env(`${ENV_PREFIX[p]}_CLIENT_ID`);
  const secret = env(`${ENV_PREFIX[p]}_CLIENT_SECRET`);
  return id && secret ? { id, secret } : null;
}

const qboSandbox = () => env("QUICKBOOKS_ENVIRONMENT").toLowerCase() === "sandbox";
const faSandbox = () => env("FREEAGENT_ENVIRONMENT").toLowerCase() === "sandbox";

const QBO = {
  authorize: "https://appcenter.intuit.com/connect/oauth2",
  token: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  revoke: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
  api: () =>
    qboSandbox()
      ? "https://sandbox-quickbooks.api.intuit.com"
      : "https://quickbooks.api.intuit.com",
  scope: "com.intuit.quickbooks.accounting",
};
const XERO = {
  authorize: "https://login.xero.com/identity/connect/authorize",
  token: "https://identity.xero.com/connect/token",
  revoke: "https://identity.xero.com/connect/revocation",
  connections: "https://api.xero.com/connections",
  api: "https://api.xero.com/api.xro/2.0",
  // Granular read-only scopes (required for Xero apps made after 2 March 2026).
  scope: "offline_access accounting.invoices.read accounting.contacts.read",
};
const FA = {
  base: () => (faSandbox() ? "https://api.sandbox.freeagent.com" : "https://api.freeagent.com"),
};

// ---------- small HTTP helper ----------

async function call(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; budget?: Budget } = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  if (init.budget && !init.budget.take(1)) return { ok: false, status: -1, data: null };
  try {
    const r = await fetch(url, {
      method: init.method ?? "GET",
      headers: { Accept: "application/json", "User-Agent": "RepSuites", ...(init.headers ?? {}) },
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const text = await r.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

const basic = (a: { id: string; secret: string }) => `Basic ${btoa(`${a.id}:${a.secret}`)}`;

// ---------- tokens (Vault) ----------

interface Tokens {
  a: string; // access token
  r: string; // refresh token
  e: number; // access token expiry, ms
}

const secretName = (p: Provider, tenantId: string) => `repsuites_acct_${p}:${tenantId}`;

async function storeTokens(p: Provider, tenantId: string, t: Tokens, budget?: Budget) {
  if (budget && !budget.take(1)) return false;
  const r = await serviceWrite<boolean>("rpc/repsuites_acct_store", "", {
    method: "POST",
    body: { p_name: secretName(p, tenantId), p_token: JSON.stringify(t) },
  });
  return !r.error;
}

async function loadTokens(p: Provider, tenantId: string, budget?: Budget): Promise<Tokens | null> {
  if (budget && !budget.take(1)) return null;
  const r = await serviceWrite<string>("rpc/repsuites_acct_token", "", {
    method: "POST",
    body: { p_name: secretName(p, tenantId) },
  });
  if (typeof r.data !== "string") return null;
  try {
    const t = JSON.parse(r.data) as Tokens;
    return t && typeof t.a === "string" && typeof t.r === "string" ? t : null;
  } catch {
    return null;
  }
}

function tokenUrl(p: Provider) {
  return p === "quickbooks"
    ? QBO.token
    : p === "xero"
      ? XERO.token
      : `${FA.base()}/v2/token_endpoint`;
}

function toTokens(data: any, oldRefresh?: string): Tokens | null {
  const a = typeof data?.access_token === "string" ? data.access_token : "";
  const r = typeof data?.refresh_token === "string" ? data.refresh_token : (oldRefresh ?? "");
  if (!a || !r) return null;
  const secs = Number(data?.expires_in);
  return { a, r, e: Date.now() + (Number.isFinite(secs) && secs > 0 ? secs : 1800) * 1000 };
}

async function exchange(p: Provider, form: Record<string, string>, budget?: Budget) {
  const a = app(p);
  if (!a) return { ok: false as const, status: 0, data: null };
  const r = await call(tokenUrl(p), {
    method: "POST",
    headers: { Authorization: basic(a), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    ...(budget ? { budget } : {}),
  });
  return r;
}

// A fresh access token, refreshing (and saving the new refresh token, which
// QuickBooks and Xero rotate) when it is within 2 minutes of expiring.
async function accessFor(
  p: Provider,
  tenantId: string,
  budget: Budget,
): Promise<{ token: string } | { error: "expired" | "api" | "network" }> {
  const t = await loadTokens(p, tenantId, budget);
  if (!t) return { error: "expired" };
  if (t.e - 120000 > Date.now()) return { token: t.a };
  const r = await exchange(p, { grant_type: "refresh_token", refresh_token: t.r }, budget);
  if (!r.ok) {
    if (r.status === 400 || r.status === 401) return { error: "expired" };
    return { error: r.status === 0 ? "network" : "api" };
  }
  const next = toTokens(r.data, t.r);
  if (!next) return { error: "api" };
  await storeTokens(p, tenantId, next, budget);
  return { token: next.a };
}

// ---------- signed-in actions ----------

async function guard(write: boolean) {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: g.error || "Sign in again." };
  if (!OWNERS.includes(g.session.role || ""))
    return { ok: false as const, error: "Only an owner or manager can do this." };
  if (write && !(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Please refresh the page and try again." };
  return {
    ok: true as const,
    tenantId: g.session.active_tenant_id!,
    userId: g.session.user_id,
    jwt: g.session.access_token,
  };
}

export async function readAccounting() {
  const g = await guard(false);
  if (!g.ok) return g;
  const r = await serviceRead<any[]>(
    `accounting_connections?select=provider,status,account_name,last_sync_at,last_error,last_error_at,queued_total,connected_at&tenant_id=eq.${g.tenantId}`,
    "",
  );
  const rows = r.data ?? [];
  return {
    ok: true as const,
    providers: PROVIDERS.map((p) => {
      const c = rows.find((x) => x.provider === p);
      return {
        provider: p,
        name: PROVIDER_NAMES[p],
        ready: app(p) !== null,
        connection: c
          ? {
              status: String(c.status) as "connected" | "needs_reconnect",
              accountName: (c.account_name as string | null) ?? null,
              lastSyncAt: (c.last_sync_at as string | null) ?? null,
              lastError: (c.last_error as string | null) ?? null,
              queuedTotal: Number(c.queued_total ?? 0),
              connectedAt: String(c.connected_at),
            }
          : null,
      };
    }),
  };
}

interface State {
  kind: "acct";
  p: Provider;
  uid: string;
  tid: string;
  exp: number;
}

export async function accountingConnectUrl(p: Provider) {
  const g = await guard(true);
  if (!g.ok) return g;
  const a = app(p);
  const cfg = getSupabaseConfig();
  if (!a || !cfg.isConfigured)
    return { ok: false as const, error: `${PROVIDER_NAMES[p]} is coming soon.` };
  const { featureBlockedFor } = await import("./tenant-access.server");
  const paid = await featureBlockedFor(g.jwt, g.tenantId, "growth");
  if (paid) return { ok: false as const, error: paid };
  const state = await encryptSessionData(
    {
      kind: "acct",
      p,
      uid: g.userId,
      tid: g.tenantId,
      exp: Date.now() + STATE_MAX_AGE_MS,
    } satisfies State,
    cfg.sessionSecret,
  );
  const q = new URLSearchParams({
    client_id: a.id,
    response_type: "code",
    redirect_uri: callbackUrl(p),
    state,
    ...(p === "quickbooks" ? { scope: QBO.scope } : p === "xero" ? { scope: XERO.scope } : {}),
  });
  const base =
    p === "quickbooks"
      ? QBO.authorize
      : p === "xero"
        ? XERO.authorize
        : `${FA.base()}/v2/approve_app`;
  return { ok: true as const, url: `${base}?${q}` };
}

// The callback: swap the code for tokens, find the company, save. Returns
// where to send the browser.
export async function finishAccountingConnect(
  provider: string,
  params: URLSearchParams,
): Promise<string> {
  const back = (why: string) =>
    `${SHARED_ORIGIN}/dashboard?acct=${encodeURIComponent(why)}${isProvider(provider) ? `&p=${provider}` : ""}#settings`;
  if (!isProvider(provider)) return back("failed");
  const p = provider;
  const cfg = getSupabaseConfig();
  const raw = params.get("state") ?? "";
  const st =
    raw && raw.length < 2000 && cfg.isConfigured
      ? await decryptSessionData<State>(raw, cfg.sessionSecret).catch(() => null)
      : null;
  if (!st || st.kind !== "acct" || st.p !== p || !UUID_RE.test(st.tid) || !(st.exp > Date.now()))
    return back("expired");
  if (params.get("error")) return back("cancelled");
  const code = params.get("code");
  if (!code || !app(p)) return back("failed");
  const r = await exchange(p, {
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(p),
  });
  const tokens = r.ok ? toTokens(r.data) : null;
  if (!tokens) return back("failed");

  let accountId: string | null = null;
  let accountName: string | null = null;
  if (p === "quickbooks") {
    const realm = params.get("realmId") ?? "";
    if (!/^\d{1,30}$/.test(realm)) return back("failed");
    accountId = realm;
    const info = await call(`${QBO.api()}/v3/company/${realm}/companyinfo/${realm}`, {
      headers: { Authorization: `Bearer ${tokens.a}` },
    });
    accountName = info.ok ? String(info.data?.CompanyInfo?.CompanyName ?? "") || null : null;
  } else if (p === "xero") {
    const c = await call(XERO.connections, { headers: { Authorization: `Bearer ${tokens.a}` } });
    const list: any[] = Array.isArray(c.data) ? c.data : [];
    const org = list.find((x) => x?.tenantType === "ORGANISATION") ?? list[0];
    const tid = String(org?.tenantId ?? "").toLowerCase();
    if (!/^[0-9a-f-]{36}$/.test(tid)) return back("noorg");
    accountId = tid;
    accountName = String(org?.tenantName ?? "") || null;
  } else {
    const c = await call(`${FA.base()}/v2/company`, {
      headers: { Authorization: `Bearer ${tokens.a}` },
    });
    accountId = String(c.data?.company?.url ?? c.data?.company?.subdomain ?? "") || null;
    accountName = String(c.data?.company?.name ?? "") || null;
  }

  if (!(await storeTokens(p, st.tid, tokens))) return back("failed");
  const now = new Date().toISOString();
  const w = await serviceWrite("accounting_connections?on_conflict=tenant_id,provider", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      tenant_id: st.tid,
      provider: p,
      status: "connected",
      account_id: accountId?.slice(0, 200) ?? null,
      account_name: accountName?.slice(0, 200) ?? null,
      // Only invoices paid from now on: connecting never asks old customers.
      sync_cursor: now,
      next_poll_at: new Date(Date.now() + HOUR).toISOString(),
      last_error: null,
      last_error_at: null,
      connected_by: UUID_RE.test(st.uid) ? st.uid : null,
      connected_at: now,
    },
  });
  return back(w.error ? "failed" : "connected");
}

export async function disconnectAccounting(p: Provider) {
  const g = await guard(true);
  if (!g.ok) return g;
  // Best effort: tell the provider too, so access is removed on their side.
  const a = app(p);
  const t = await loadTokens(p, g.tenantId).catch(() => null);
  if (a && t) {
    if (p === "quickbooks")
      await call(QBO.revoke, {
        method: "POST",
        headers: { Authorization: basic(a), "Content-Type": "application/json" },
        body: JSON.stringify({ token: t.r }),
      });
    else if (p === "xero")
      await call(XERO.revoke, {
        method: "POST",
        headers: { Authorization: basic(a), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: t.r }).toString(),
      });
  }
  await serviceWrite<boolean>("rpc/repsuites_acct_forget", "", {
    method: "POST",
    body: { p_name: secretName(p, g.tenantId) },
  });
  const d = await serviceWrite(
    `accounting_connections?tenant_id=eq.${g.tenantId}&provider=eq.${p}`,
    "",
    { method: "DELETE" },
  );
  return d.error
    ? { ok: false as const, error: "Could not disconnect. Try again." }
    : { ok: true as const };
}

export async function checkAccountingNow(p: Provider) {
  const g = await guard(true);
  if (!g.ok) return g;
  await serviceWrite(
    `accounting_connections?tenant_id=eq.${g.tenantId}&provider=eq.${p}&status=eq.connected`,
    "",
    { method: "PATCH", body: { next_poll_at: new Date().toISOString() } },
  );
  return { ok: true as const };
}

// ---------- webhooks: verify, then nudge the matching connections ----------

async function nudge(p: Provider, accountIds: string[]) {
  if (!accountIds.length) return;
  const list = accountIds.map((id) => `"${encodeURIComponent(id)}"`).join(",");
  await serviceWrite(
    `accounting_connections?provider=eq.${p}&account_id=in.(${list})&status=eq.connected`,
    "",
    { method: "PATCH", body: { next_poll_at: new Date().toISOString() } },
  );
}

export async function handleQuickBooksWebhook(
  raw: string,
  signature: string | null,
): Promise<number> {
  const key = env("QUICKBOOKS_WEBHOOK_VERIFIER");
  if (!key) return 503;
  if (!(await verifyQuickBooksSignature(raw, signature, key))) return 401;
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return 200;
  }
  await nudge("quickbooks", quickBooksRealms(body).slice(0, 40));
  return 200;
}

export async function handleXeroWebhook(raw: string, signature: string | null): Promise<number> {
  const key = env("XERO_WEBHOOK_KEY");
  if (!key) return 401;
  // Xero's "intent to receive" check needs exactly 200 or 401.
  if (!(await verifyXeroSignature(raw, signature, key))) return 401;
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return 200;
  }
  await nudge("xero", xeroTenants(body).slice(0, 40));
  return 200;
}

// ---------- the sync (run by the database every 10 minutes when due) ----------

interface Conn {
  tenant_id: string;
  provider: Provider;
  account_id: string | null;
  sync_cursor: string;
  queued_total: number;
}

// Database calls used by one connection apart from invoices: tokens (up to
// 3), the invoice list, contacts, the queue (feature, settings x2, timezone,
// duplicates, past asks, opt-outs, insert) and the final save.
const FIXED_COST = 15;
const PAGE = 50;

interface Fetched {
  items: PaidInvoice[]; // paid ones, with their position in the full list
  allUpdatedAts: string[]; // every invoice returned, oldest first
  paidIndex: number[]; // position of each paid invoice in allUpdatedAts
  full: boolean; // the page was full, so there may be more
}

function shape(all: { updatedAt: string; paid: PaidInvoice | null }[]): Fetched {
  const sorted = oldestFirst(all);
  const items: PaidInvoice[] = [];
  const paidIndex: number[] = [];
  sorted.forEach((x, i) => {
    if (x.paid) {
      items.push(x.paid);
      paidIndex.push(i);
    }
  });
  return {
    items,
    allUpdatedAts: sorted.map((x) => x.updatedAt),
    paidIndex,
    full: all.length >= PAGE,
  };
}

const qboTime = (iso: string) => `${iso.slice(0, 19)}-00:00`;

async function fetchInvoices(
  c: Conn,
  token: string,
  budget: Budget,
): Promise<Fetched | { error: "expired" | "api" | "network" }> {
  const auth = { Authorization: `Bearer ${token}` };
  const fail = (s: number) =>
    ({ error: s === 401 ? "expired" : s === 0 ? "network" : "api" }) as const;
  if (c.provider === "quickbooks") {
    const realm = c.account_id ?? "";
    const q = `select * from Invoice where MetaData.LastUpdatedTime >= '${qboTime(c.sync_cursor)}' orderby MetaData.LastUpdatedTime maxresults ${PAGE}`;
    const r = await call(
      `${QBO.api()}/v3/company/${realm}/query?query=${encodeURIComponent(q)}&minorversion=75`,
      { headers: auth, budget },
    );
    if (!r.ok) return fail(r.status);
    const list: any[] = r.data?.QueryResponse?.Invoice ?? [];
    return shape(
      list.map((inv) => ({
        updatedAt: new Date(Date.parse(inv?.MetaData?.LastUpdatedTime) || 0).toISOString(),
        paid: quickBooksPaid(inv, realm),
      })),
    );
  }
  if (c.provider === "xero") {
    const q = new URLSearchParams({
      where: 'Type=="ACCREC"',
      Statuses: "PAID",
      order: "UpdatedDateUTC ASC",
      page: "1",
      pageSize: String(PAGE),
    });
    const r = await call(`${XERO.api}/Invoices?${q}`, {
      headers: {
        ...auth,
        "xero-tenant-id": c.account_id ?? "",
        "If-Modified-Since": c.sync_cursor.slice(0, 19),
      },
      budget,
    });
    if (!r.ok) return fail(r.status);
    const list: any[] = r.data?.Invoices ?? [];
    return shape(
      list.map((inv) => {
        const paid = xeroPaid(inv);
        return { updatedAt: paid?.updatedAt ?? c.sync_cursor, paid };
      }),
    );
  }
  const q = new URLSearchParams({
    view: "all",
    updated_since: c.sync_cursor,
    per_page: String(PAGE),
  });
  const r = await call(`${FA.base()}/v2/invoices?${q}`, { headers: auth, budget });
  if (!r.ok) return fail(r.status);
  const list: any[] = r.data?.invoices ?? [];
  return shape(
    list.map((inv) => ({
      updatedAt: new Date(Date.parse(inv?.updated_at) || 0).toISOString(),
      paid: freeAgentPaid(inv),
    })),
  );
}

async function fetchCustomers(
  c: Conn,
  token: string,
  keys: string[],
  budget: Budget,
): Promise<Map<string, Customer>> {
  const out = new Map<string, Customer>();
  const unique = [...new Set(keys)];
  if (!unique.length) return out;
  const auth = { Authorization: `Bearer ${token}` };
  if (c.provider === "quickbooks") {
    const ids = unique.filter((k) => /^\d+$/.test(k));
    if (!ids.length) return out;
    const q = `select * from Customer where Id in (${ids.map((i) => `'${i}'`).join(",")})`;
    const r = await call(
      `${QBO.api()}/v3/company/${c.account_id}/query?query=${encodeURIComponent(q)}&minorversion=75`,
      { headers: auth, budget },
    );
    for (const cu of r.data?.QueryResponse?.Customer ?? [])
      out.set(String(cu?.Id ?? ""), quickBooksCustomer(cu));
  } else if (c.provider === "xero") {
    const r = await call(`${XERO.api}/Contacts?IDs=${unique.join(",")}`, {
      headers: { ...auth, "xero-tenant-id": c.account_id ?? "" },
      budget,
    });
    for (const cu of r.data?.Contacts ?? [])
      out.set(String(cu?.ContactID ?? "").toLowerCase(), xeroCustomer(cu));
  } else {
    // FreeAgent: one contact per request (each costs one from the budget).
    for (const url of unique) {
      const r = await call(url, { headers: auth, budget });
      if (r.ok) out.set(url, freeAgentCustomer(r.data));
    }
  }
  return out;
}

async function saveConn(c: Conn, body: Record<string, unknown>, budget: Budget) {
  budget.take(1);
  await serviceWrite(
    `accounting_connections?tenant_id=eq.${c.tenant_id}&provider=eq.${c.provider}`,
    "",
    { method: "PATCH", body },
  );
}

async function syncOne(c: Conn, budget: Budget): Promise<number> {
  const now = new Date();
  const later = new Date(now.getTime() + HOUR).toISOString();
  const failWith = async (kind: "expired" | "api" | "network") => {
    await saveConn(
      c,
      {
        ...(kind === "expired" ? { status: "needs_reconnect" } : {}),
        last_error: connectionError(c.provider, kind),
        last_error_at: now.toISOString(),
        next_poll_at: later,
      },
      budget,
    );
    return 0;
  };
  const acc = await accessFor(c.provider, c.tenant_id, budget);
  if ("error" in acc) return failWith(acc.error);
  const got = await fetchInvoices(c, acc.token, budget);
  if ("error" in got) return failWith(got.error);

  const perInvoice = c.provider === "freeagent" ? 1 : 0;
  // What is left after the queue and the save (8 + 1); FreeAgent also pays per contact.
  const cap = invoiceCap(budget.left, 9 + (perInvoice ? 0 : 1), perInvoice, 25);
  if (cap === 0 && got.items.length) {
    // Not enough room left in this run: try again on the next one.
    await saveConn(c, { next_poll_at: now.toISOString() }, budget);
    return 0;
  }
  const take = got.items.slice(0, cap);
  const capped = take.length < got.items.length || got.full;
  // How far through the full list we got: up to the last paid invoice taken,
  // or the whole page when every paid invoice was taken.
  const handled =
    take.length < got.items.length
      ? (got.paidIndex[take.length] ?? got.allUpdatedAts.length)
      : got.allUpdatedAts.length;

  let added = 0;
  let note: string | null = null;
  if (take.length) {
    const customers = await fetchCustomers(
      c,
      acc.token,
      take.map((i) => i.customerKey),
      budget,
    );
    const people = take
      .map((inv) => invoiceToRequest(inv, customers.get(inv.customerKey) ?? null))
      .filter((x): x is NonNullable<typeof x> => !!x);
    if (people.length) {
      budget.take(1);
      const { tenantHasFeatureService } = await import("./tenant-access.server");
      if (!(await tenantHasFeatureService(c.tenant_id, "growth"))) {
        note = "Review requests are not in this plan, so paid invoices were not used.";
      } else {
        const { queueRequests, settingsFor, timezoneFor } =
          await import("./review-requests.server");
        const { triggeredSendTime } = await import("./review-requests");
        budget.take(2);
        const [s, tz] = await Promise.all([settingsFor(c.tenant_id), timezoneFor(c.tenant_id)]);
        const dueAt = triggeredSendTime(now, s.firstDelayHours, tz, {
          start: s.quietStart,
          end: s.quietEnd,
        }).toISOString();
        budget.take(5);
        const q = await queueRequests(
          c.tenant_id,
          people.map((x) => ({
            name: x.name,
            email: x.email,
            phone: x.phone,
            channel: x.email ? ("email" as const) : ("whatsapp" as const),
            externalId: x.externalId,
          })),
          { dueAt, source: "accounting", event: "invoice_paid", externalId: null, createdBy: null },
        );
        if (q.ok) added = q.added + q.skipped;
        else if (q.error !== "duplicate") return failWith("api");
      }
    }
  }
  await saveConn(
    c,
    {
      sync_cursor: nextCursor(c.sync_cursor, got.allUpdatedAts, handled, capped, now),
      last_sync_at: now.toISOString(),
      // More to read: come back on the next run (10 minutes) instead of in an hour.
      next_poll_at: capped ? now.toISOString() : later,
      last_error: note,
      last_error_at: note ? now.toISOString() : null,
      queued_total: (c.queued_total ?? 0) + added,
    },
    budget,
  );
  return added;
}

export async function runAccountingSync(
  budget: Budget,
): Promise<{ checked: number; queued: number }> {
  if (!budget.take(1)) return { checked: 0, queued: 0 };
  const due = await serviceRead<Conn[]>(
    `accounting_connections?select=tenant_id,provider,account_id,sync_cursor,queued_total&status=eq.connected&next_poll_at=lte.${new Date().toISOString()}&order=next_poll_at.asc&limit=5`,
    "",
  );
  let checked = 0;
  let queued = 0;
  for (const c of due.data ?? []) {
    if (!isProvider(c.provider) || !app(c.provider)) continue;
    if (!budget.can(FIXED_COST)) break;
    checked++;
    queued += await syncOne(c, budget).catch(() => 0);
  }
  return { checked, queued };
}
