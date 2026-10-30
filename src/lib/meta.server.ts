/* eslint-disable @typescript-eslint/no-explicit-any -- Meta Graph JSON is checked field by field. */
// Server-only: Facebook Page and Instagram posting for one business.
//
// 1. An owner clicks "Connect Facebook and Instagram" (Posts tab). Facebook
//    Login runs on repsuites.com with a sealed state naming the business.
// 2. The callback swaps the code for a long-lived user token (kept in Vault)
//    and lists the Pages. One Page: chosen straight away. Several: they pick.
// 3. The chosen Page's token goes into Vault too. When an approved post
//    publishes on Google, it also goes to the Page and to Instagram.
// Needs REPSUITES_META_APP_ID and REPSUITES_META_APP_SECRET. No em dashes.
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { getSupabaseConfig } from "./config.server";
import { decryptSessionData, encryptSessionData } from "./session.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { SHARED_ORIGIN } from "./tenant-links.server";
import { featureBlockedFor } from "./tenant-access.server";
import { fbMessage, GRAPH, igCanUse, igCaption, META_SCOPES, metaError } from "./social";

export const META_CALLBACK_PATH = "/api/meta/oauth/callback";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNERS = ["owner", "admin", "super_admin", "manager"];
const MAX_AGE_MS = 30 * 60 * 1000;

function app(): { id: string; secret: string } | null {
  const id = (process.env["REPSUITES_META_APP_ID"] ?? "").trim();
  const secret = (process.env["REPSUITES_META_APP_SECRET"] ?? "").trim();
  return id && secret ? { id, secret } : null;
}

export function metaReady(): boolean {
  return app() !== null;
}

async function guard(write: boolean) {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: g.error || "Sign in again." };
  if (!OWNERS.includes(g.session.role || ""))
    return { ok: false as const, error: "Only an owner or manager can do this." };
  if (write && !(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Please refresh the page and try again." };
  const tenantId = g.session.active_tenant_id!;
  const paid = await featureBlockedFor(g.session.access_token, tenantId, "growth");
  if (paid) return { ok: false as const, error: paid };
  return { ok: true as const, tenantId, userId: g.session.user_id };
}

async function graph(
  path: string,
  init: { method?: string; params?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const method = init.method ?? "GET";
  const q = new URLSearchParams(init.params ?? {});
  const url = `${GRAPH}/${path}${method === "GET" && q.size ? `?${q}` : ""}`;
  try {
    const r = await fetch(url, {
      method,
      signal: AbortSignal.timeout(20000),
      ...(method !== "GET"
        ? { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: q.toString() }
        : {}),
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok && !data?.error, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

const tokenName = (kind: "user" | "page", tenantId: string) => `repsuites_meta_${kind}:${tenantId}`;

async function storeToken(kind: "user" | "page", tenantId: string, token: string) {
  const r = await serviceWrite<boolean>("rpc/repsuites_meta_store", "", {
    method: "POST",
    body: { p_name: tokenName(kind, tenantId), p_token: token },
  });
  return !r.error;
}

async function tokenFor(kind: "user" | "page", tenantId: string): Promise<string | null> {
  const r = await serviceWrite<string>("rpc/repsuites_meta_token", "", {
    method: "POST",
    body: { p_name: tokenName(kind, tenantId) },
  });
  return typeof r.data === "string" && r.data ? r.data : null;
}

interface PageChoice {
  id: string;
  name: string;
  igId: string | null;
  igUsername: string | null;
}

async function listPages(
  userToken: string,
): Promise<{ pages: (PageChoice & { token: string })[] } | { error: string }> {
  const r = await graph("me/accounts", {
    params: {
      access_token: userToken,
      fields: "id,name,access_token,instagram_business_account{id,username}",
      limit: "50",
    },
  });
  if (!r.ok) return { error: metaError(r.data, r.status) };
  const pages = (r.data?.data ?? [])
    .filter((p: any) => /^\d+$/.test(String(p?.id ?? "")) && typeof p?.access_token === "string")
    .map((p: any) => ({
      id: String(p.id),
      name: String(p.name ?? "Facebook Page").slice(0, 200),
      token: String(p.access_token),
      igId: /^\d+$/.test(String(p.instagram_business_account?.id ?? ""))
        ? String(p.instagram_business_account.id)
        : null,
      igUsername: p.instagram_business_account?.username
        ? String(p.instagram_business_account.username).slice(0, 100)
        : null,
    }));
  return { pages };
}

// ---------- connecting ----------

interface State {
  kind: "meta";
  uid: string;
  tid: string;
  exp: number;
}

export async function metaConnectUrl() {
  const g = await guard(true);
  if (!g.ok) return g;
  const a = app();
  const cfg = getSupabaseConfig();
  if (!a || !cfg.isConfigured)
    return { ok: false as const, error: "Facebook and Instagram are coming soon." };
  const state = await encryptSessionData(
    { kind: "meta", uid: g.userId, tid: g.tenantId, exp: Date.now() + MAX_AGE_MS } satisfies State,
    cfg.sessionSecret,
  );
  const q = new URLSearchParams({
    client_id: a.id,
    redirect_uri: `${SHARED_ORIGIN}${META_CALLBACK_PATH}`,
    response_type: "code",
    scope: META_SCOPES.join(","),
    state,
  });
  return { ok: true as const, url: `https://www.facebook.com/v21.0/dialog/oauth?${q}` };
}

async function savePageChoice(tenantId: string, page: PageChoice & { token: string }) {
  if (!(await storeToken("page", tenantId, page.token))) return false;
  const w = await serviceWrite(`meta_connections?tenant_id=eq.${tenantId}`, "", {
    method: "PATCH",
    body: {
      status: "connected",
      page_id: page.id,
      page_name: page.name,
      ig_user_id: page.igId,
      ig_username: page.igUsername,
      error: null,
    },
  });
  return !w.error;
}

// Called by the callback route. Returns where to send the browser.
export async function finishMetaConnect(params: URLSearchParams): Promise<string> {
  const back = (why: string) => `${SHARED_ORIGIN}/dashboard?meta=${encodeURIComponent(why)}#posts`;
  const cfg = getSupabaseConfig();
  const raw = params.get("state") ?? "";
  const st =
    raw && raw.length < 2000 && cfg.isConfigured
      ? await decryptSessionData<State>(raw, cfg.sessionSecret).catch(() => null)
      : null;
  if (!st || st.kind !== "meta" || !UUID_RE.test(st.tid) || !(st.exp > Date.now()))
    return back("expired");
  if (params.get("error")) return back("cancelled");
  const code = params.get("code");
  const a = app();
  if (!code || !a) return back("failed");
  const short = await graph("oauth/access_token", {
    params: {
      client_id: a.id,
      client_secret: a.secret,
      redirect_uri: `${SHARED_ORIGIN}${META_CALLBACK_PATH}`,
      code,
    },
  });
  if (!short.ok || typeof short.data?.access_token !== "string") return back("failed");
  const long = await graph("oauth/access_token", {
    params: {
      grant_type: "fb_exchange_token",
      client_id: a.id,
      client_secret: a.secret,
      fb_exchange_token: short.data.access_token,
    },
  });
  const userToken =
    long.ok && typeof long.data?.access_token === "string"
      ? long.data.access_token
      : short.data.access_token;
  if (!(await storeToken("user", st.tid, userToken))) return back("failed");
  const me = await graph("me", { params: { access_token: userToken, fields: "id,name" } });
  const list = await listPages(userToken);
  const pages = "pages" in list ? list.pages : [];
  await serviceWrite("meta_connections?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      tenant_id: st.tid,
      status: "choose_page",
      user_name: me.ok ? String(me.data?.name ?? "").slice(0, 200) || null : null,
      meta_user_id: me.ok && /^\d+$/.test(String(me.data?.id ?? "")) ? String(me.data.id) : null,
      page_id: null,
      page_name: null,
      ig_user_id: null,
      ig_username: null,
      pages: pages.map(({ id, name, igId, igUsername }) => ({ id, name, igId, igUsername })),
      error:
        "error" in list
          ? list.error
          : pages.length
            ? null
            : "No Facebook Page found. Make sure you choose your Page when Facebook asks.",
      connected_by: UUID_RE.test(st.uid) ? st.uid : null,
      connected_at: new Date().toISOString(),
    },
  });
  if (pages.length === 1) await savePageChoice(st.tid, pages[0]!);
  return back(pages.length ? "connected" : "nopage");
}

export async function readMeta() {
  const g = await guard(false);
  if (!g.ok) return g;
  if (!metaReady()) return { ok: true as const, ready: false as const };
  const r = await serviceRead<any[]>(
    `meta_connections?select=status,user_name,page_name,ig_username,pages,error&tenant_id=eq.${g.tenantId}`,
    "",
  );
  const c = r.data?.[0];
  return {
    ok: true as const,
    ready: true as const,
    connection: c
      ? {
          status: String(c.status) as "choose_page" | "connected" | "needs_reconnect",
          userName: (c.user_name as string | null) ?? null,
          pageName: (c.page_name as string | null) ?? null,
          igUsername: (c.ig_username as string | null) ?? null,
          pages: (Array.isArray(c.pages) ? c.pages : []) as PageChoice[],
          error: (c.error as string | null) ?? null,
        }
      : null,
  };
}

export async function chooseMetaPage(input: { pageId: string }) {
  const g = await guard(true);
  if (!g.ok) return g;
  if (!/^\d{1,40}$/.test(input.pageId)) return { ok: false as const, error: "Choose a Page." };
  const userToken = await tokenFor("user", g.tenantId);
  if (!userToken) return { ok: false as const, error: "Connect Facebook again." };
  const list = await listPages(userToken);
  if ("error" in list) return { ok: false as const, error: list.error };
  const page = list.pages.find((p) => p.id === input.pageId);
  if (!page) return { ok: false as const, error: "That Page is no longer available." };
  return (await savePageChoice(g.tenantId, page))
    ? { ok: true as const }
    : { ok: false as const, error: "Could not save. Try again." };
}

export async function disconnectMeta() {
  const g = await guard(true);
  if (!g.ok) return g;
  const userToken = await tokenFor("user", g.tenantId);
  if (userToken)
    await graph("me/permissions", { method: "DELETE", params: { access_token: userToken } });
  await serviceWrite("rpc/repsuites_meta_forget", "", {
    method: "POST",
    body: { p_tenant: g.tenantId },
  });
  await serviceWrite(`meta_connections?tenant_id=eq.${g.tenantId}`, "", { method: "DELETE" });
  return { ok: true as const };
}

export async function setPostChannels(input: {
  id: string;
  facebook: boolean;
  instagram: boolean;
}) {
  const g = await guard(true);
  if (!g.ok) return g;
  if (!UUID_RE.test(input.id)) return { ok: false as const, error: "Unknown post." };
  const w = await serviceWrite(
    `google_posts?id=eq.${input.id}&tenant_id=eq.${g.tenantId}&status=in.(draft,scheduled)`,
    "",
    { method: "PATCH", body: { fb_enabled: input.facebook, ig_enabled: input.instagram } },
  );
  return w.error ? { ok: false as const, error: "Could not save." } : { ok: true as const };
}

// Facebook and Instagram results for the dashboard's post list (read on its
// own, so the post list still works if this part is not set up).
export async function readPostChannels() {
  const g = await guard(false);
  if (!g.ok) return g;
  const r = await serviceRead<any[]>(
    `google_posts?select=id,fb_enabled,ig_enabled,fb_status,fb_error,ig_status,ig_error&tenant_id=eq.${g.tenantId}&status=neq.cancelled&order=publish_at.desc&limit=30`,
    "",
  );
  return {
    ok: true as const,
    posts: (r.data ?? []).map((p) => ({
      id: String(p.id),
      facebook: p.fb_enabled !== false,
      instagram: p.ig_enabled !== false,
      fbStatus: (p.fb_status ?? null) as "posted" | "failed" | "skipped" | null,
      fbError: (p.fb_error ?? null) as string | null,
      igStatus: (p.ig_status ?? null) as "posted" | "failed" | "skipped" | null,
      igError: (p.ig_error ?? null) as string | null,
    })),
  };
}

// ---------- publishing (called when a post goes out on Google) ----------

export async function publishToMeta(row: {
  id: string;
  tenant_id: string;
  summary: string;
  image_url?: string | null;
  action_url?: string | null;
}): Promise<void> {
  if (!metaReady()) return;
  const c = await serviceRead<any[]>(
    `meta_connections?select=status,page_id,ig_user_id&tenant_id=eq.${row.tenant_id}`,
    "",
  );
  const conn = c.data?.[0];
  if (!conn || conn.status !== "connected" || !conn.page_id) return;
  const flags = await serviceRead<any[]>(
    `google_posts?select=fb_enabled,ig_enabled,fb_status,ig_status&id=eq.${row.id}`,
    "",
  );
  const f = flags.data?.[0];
  if (!f) return;
  const pageToken = await tokenFor("page", row.tenant_id);
  const patch: Record<string, unknown> = {};
  const image = typeof row.image_url === "string" && /^https:\/\//.test(row.image_url);

  if (f.fb_enabled !== false && f.fb_status !== "posted") {
    if (!pageToken)
      Object.assign(patch, { fb_status: "failed", fb_error: "Connect Facebook again." });
    else {
      const r = image
        ? await graph(`${conn.page_id}/photos`, {
            method: "POST",
            params: {
              url: row.image_url!,
              caption: fbMessage(row.summary, row.action_url),
              access_token: pageToken,
            },
          })
        : await graph(`${conn.page_id}/feed`, {
            method: "POST",
            params: {
              message: fbMessage(row.summary),
              ...(row.action_url && /^https:\/\//.test(row.action_url)
                ? { link: row.action_url }
                : {}),
              access_token: pageToken,
            },
          });
      Object.assign(
        patch,
        r.ok
          ? {
              fb_status: "posted",
              fb_error: null,
              fb_post_id: String(r.data?.post_id ?? r.data?.id ?? "").slice(0, 100) || null,
            }
          : { fb_status: "failed", fb_error: metaError(r.data, r.status) },
      );
      if (!r.ok && r.data?.error?.code === 190)
        await serviceWrite(`meta_connections?tenant_id=eq.${row.tenant_id}`, "", {
          method: "PATCH",
          body: { status: "needs_reconnect", error: "Facebook needs connecting again." },
        });
    }
  }

  if (f.ig_enabled !== false && f.ig_status !== "posted") {
    if (!conn.ig_user_id)
      Object.assign(patch, {
        ig_status: "skipped",
        ig_error: "no Instagram business account linked to the Page",
      });
    else if (!igCanUse(row.image_url))
      Object.assign(patch, { ig_status: "skipped", ig_error: "Instagram needs a picture" });
    else if (!pageToken)
      Object.assign(patch, { ig_status: "failed", ig_error: "Connect Facebook again." });
    else {
      const made = await graph(`${conn.ig_user_id}/media`, {
        method: "POST",
        params: {
          image_url: row.image_url!,
          caption: igCaption(row.summary),
          access_token: pageToken,
        },
      });
      const done =
        made.ok && made.data?.id
          ? await graph(`${conn.ig_user_id}/media_publish`, {
              method: "POST",
              params: { creation_id: String(made.data.id), access_token: pageToken },
            })
          : made;
      Object.assign(
        patch,
        done.ok
          ? {
              ig_status: "posted",
              ig_error: null,
              ig_media_id: String(done.data?.id ?? "").slice(0, 100) || null,
            }
          : {
              ig_status: "failed",
              ig_error: metaError(done.data, done.status).replace(
                "Facebook said",
                "Instagram said",
              ),
            },
      );
    }
  }
  if (Object.keys(patch).length)
    await serviceWrite(`google_posts?id=eq.${row.id}`, "", { method: "PATCH", body: patch });
}

// ---------- Meta's data deletion callback ----------

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

// Meta posts a signed_request when someone removes the app. We check the
// signature, forget that person's Facebook connections, and return a link
// to a status page with a confirmation code (Meta's required format).
export async function handleDeletion(signedRequest: string) {
  const a = app();
  const [sig, payload] = signedRequest.split(".");
  if (!a || !sig || !payload) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(a.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlBytes(sig),
    new TextEncoder().encode(payload),
  );
  if (!ok) return null;
  let data: { user_id?: unknown } = {};
  try {
    data = JSON.parse(new TextDecoder().decode(b64urlBytes(payload)));
  } catch {
    return null;
  }
  const userId = /^\d+$/.test(String(data.user_id ?? "")) ? String(data.user_id) : null;
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  if (userId) {
    const conns = await serviceRead<{ tenant_id: string }[]>(
      `meta_connections?select=tenant_id&meta_user_id=eq.${userId}`,
      "",
    );
    for (const c of conns.data ?? []) {
      await serviceWrite("rpc/repsuites_meta_forget", "", {
        method: "POST",
        body: { p_tenant: c.tenant_id },
      });
      await serviceWrite(`meta_connections?tenant_id=eq.${c.tenant_id}`, "", { method: "DELETE" });
    }
  }
  await serviceWrite("meta_deletion_requests", "", {
    method: "POST",
    body: { code, meta_user_id: userId, done_at: new Date().toISOString() },
  });
  return { url: `${SHARED_ORIGIN}/meta-deletion?code=${code}`, confirmation_code: code };
}

export async function deletionStatus(code: string) {
  if (!/^[0-9a-f]{20}$/.test(code)) return null;
  const r = await serviceRead<{ done_at: string | null }[]>(
    `meta_deletion_requests?select=done_at&code=eq.${code}`,
    "",
  );
  return r.data?.[0] ?? null;
}
