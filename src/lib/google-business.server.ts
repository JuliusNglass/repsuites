/* eslint-disable @typescript-eslint/no-explicit-any -- Google and PostgREST JSON is checked field by field. */
// Server-only: Google Business Profile for each business.
//
// 1. An owner or admin clicks Connect. Google sign-in runs on the shared
//    address (the only one registered with Google), with a sealed state that
//    names the user and business, so it works from a business's own address.
// 2. The callback swaps the code for a refresh token (kept in Vault) and
//    picks the profile, or asks which one when there are several.
// 3. Reviews come in every 30 minutes and on demand. Replies are drafted
//    for the owner to approve, then posted to Google. Posts go out at the
//    time chosen.
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { getSupabaseConfig } from "./config.server";
import { decryptSessionData, encryptSessionData } from "./session.server";
import { hasServiceRole, serviceRead, serviceWrite } from "./supabase-service.server";
import { linkOrigin, SHARED_ORIGIN } from "./tenant-links.server";
import {
  DEFAULT_TEMPLATES,
  draftReviewReply,
  lastDraftProblem,
  type ReplyTemplates,
} from "./review-reply-draft";

export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/business.manage"];
const STATE_MAX_AGE_MS = 30 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIEW = ["owner", "admin", "super_admin", "manager"];
const OWNERS = ["owner", "admin", "super_admin"];

export const CALLBACK_PATH = "/api/google/oauth/callback";
export const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export function clientCreds(): { id: string; secret: string } | null {
  const id = (process.env["REPSUITES_GOOGLE_CLIENT_ID"] ?? "").trim();
  const secret = (process.env["REPSUITES_GOOGLE_CLIENT_SECRET"] ?? "").trim();
  return id && secret ? { id, secret } : null;
}

export function googleReady(): boolean {
  return clientCreds() !== null && hasServiceRole();
}

async function guard(write: boolean, owners = false) {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: g.error || "Sign in again." };
  const role = g.session.role || "";
  if (!(owners ? OWNERS : VIEW).includes(role))
    return {
      ok: false as const,
      error: owners ? "Only an owner or admin can do this." : "Access denied.",
    };
  const tenantId = g.session.active_tenant_id!;
  if (write && !(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Invalid request origin" };
  return {
    ok: true as const,
    tenantId,
    userId: g.session.user_id,
    role,
    jwt: g.session.access_token,
  };
}

// Paid tools (RepSuites Growth). Agency operators always pass.
async function growthBlocked(g: { jwt: string; tenantId: string }): Promise<string | null> {
  const { featureBlockedFor } = await import("./tenant-access.server");
  return featureBlockedFor(g.jwt, g.tenantId, "growth");
}

// ---------- Google calls ----------

export async function google(
  token: string,
  url: string,
  init: { method?: string; body?: unknown } = {},
) {
  try {
    const r = await fetch(url, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await r.text();
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

export function googleError(r: { status: number; data: any }): string {
  const m = String(r.data?.error?.message ?? "").slice(0, 200);
  if (r.status === 401 || r.status === 403)
    return m.includes("disabled") || m.includes("quota")
      ? `Google refused: ${m}`
      : "Google needs the profile connected again.";
  if (r.status === 429) return "Google is busy. Try again in a minute.";
  return m ? `Google said: ${m}` : "Google could not be reached. Try again.";
}

export async function tokenRequest(form: Record<string, string>) {
  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await r.json().catch(() => null)) as any;
    if (!r.ok) return { ok: false as const, error: String(body?.error ?? r.status) };
    return { ok: true as const, body };
  } catch {
    return { ok: false as const, error: "network" };
  }
}

// A fresh access token for a business, from its stored refresh token.
// Kept for a few minutes within one server instance, so a run that touches
// the same business several times asks Google once.
const tokenCache = new Map<string, { token: string; until: number }>();

async function accessToken(tenantId: string): Promise<string | null> {
  const hit = tokenCache.get(tenantId);
  if (hit && hit.until > Date.now()) return hit.token;
  const fresh = await fetchAccessToken(tenantId);
  if (fresh) tokenCache.set(tenantId, { token: fresh, until: Date.now() + 5 * 60000 });
  else tokenCache.delete(tenantId);
  return fresh;
}

async function fetchAccessToken(tenantId: string): Promise<string | null> {
  const creds = clientCreds();
  if (!creds) return null;
  const rt = await serviceWrite<string>("rpc/repsuites_google_refresh_for", "", {
    method: "POST",
    body: { p_tenant: tenantId },
  });
  if (rt.error || typeof rt.data !== "string" || !rt.data) return null;
  const t = await tokenRequest({
    client_id: creds.id,
    client_secret: creds.secret,
    grant_type: "refresh_token",
    refresh_token: rt.data,
  });
  if (!t.ok) {
    if (t.error === "invalid_grant")
      await serviceWrite<unknown>(`google_connections?tenant_id=eq.${tenantId}`, "", {
        method: "PATCH",
        body: {
          status: "needs_reconnect",
          error: "Google access was removed or expired. Connect again.",
        },
      });
    return null;
  }
  return typeof t.body?.access_token === "string" ? t.body.access_token : null;
}

// The email from Google's ID token (it came straight from Google over TLS).
export function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.email === "string" ? json.email.slice(0, 320) : null;
  } catch {
    return null;
  }
}

export interface Place {
  account: string;
  location: string;
  title: string;
  address: string;
}

export async function listPlaces(token: string): Promise<Place[] | { error: string }> {
  const acc = await google(
    token,
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20",
  );
  if (!acc.ok) return { error: googleError(acc) };
  const out: Place[] = [];
  // Agencies can manage hundreds of profiles: read every page (100 a page),
  // within Cloudflare's limit on outgoing requests per run.
  let calls = 1;
  for (const a of (acc.data?.accounts ?? []).slice(0, 10)) {
    const name = String(a.name ?? "");
    if (!/^accounts\/[0-9]+$/.test(name)) continue;
    let pageToken = "";
    do {
      if (calls >= 40) break;
      calls++;
      const loc = await google(
        token,
        `https://mybusinessbusinessinformation.googleapis.com/v1/${name}/locations?pageSize=100&readMask=name,title,storefrontAddress${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      );
      if (!loc.ok) break;
      pageToken = typeof loc.data?.nextPageToken === "string" ? loc.data.nextPageToken : "";
      for (const l of loc.data?.locations ?? []) {
        const ln = String(l.name ?? "");
        if (!/^locations\/[0-9]+$/.test(ln)) continue;
        const ad = l.storefrontAddress ?? {};
        out.push({
          account: name,
          location: ln,
          title: String(l.title ?? "Business").slice(0, 200),
          address: [...(ad.addressLines ?? []), ad.locality, ad.postalCode]
            .filter(Boolean)
            .join(", "),
        });
      }
    } while (pageToken);
  }
  return out.sort((x, y) => x.title.localeCompare(y.title, "en", { sensitivity: "base" }));
}

// ---------- connecting ----------

interface State {
  uid: string;
  tid: string;
  back: string;
  exp: number;
}

export async function googleConnectUrl() {
  const g = await guard(true, true);
  if (!g.ok) return { ok: false as const, error: g.error };
  const creds = clientCreds();
  const cfg = getSupabaseConfig();
  if (!creds || !cfg.isConfigured)
    return { ok: false as const, error: "Google is not set up yet." };
  const state = await encryptSessionData(
    {
      uid: g.userId,
      tid: g.tenantId,
      back: await linkOrigin(g.tenantId),
      exp: Date.now() + STATE_MAX_AGE_MS,
    } satisfies State,
    cfg.sessionSecret,
  );
  const q = new URLSearchParams({
    client_id: creds.id,
    redirect_uri: `${SHARED_ORIGIN}${CALLBACK_PATH}`,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return { ok: true as const, url: `${AUTH_URL}?${q}` };
}

// Called by the callback route. Returns where to send the browser.
export async function finishGoogleConnect(params: URLSearchParams): Promise<string> {
  const cfg = getSupabaseConfig();
  const fail = (back: string, why: string) => `${back}/dashboard?google=${encodeURIComponent(why)}`;
  const raw = params.get("state") ?? "";
  const st =
    raw && raw.length < 2000 && cfg.isConfigured
      ? await decryptSessionData<State>(raw, cfg.sessionSecret)
      : null;
  if (!st || typeof st.tid !== "string" || !UUID_RE.test(st.tid) || !(st.exp > Date.now()))
    return `${SHARED_ORIGIN}/dashboard?google=expired`;
  const back =
    typeof st.back === "string" && /^https:\/\/[a-z0-9.-]+$/i.test(st.back)
      ? st.back
      : SHARED_ORIGIN;
  if (params.get("error")) return fail(back, "cancelled");
  const code = params.get("code");
  const creds = clientCreds();
  if (!code || !creds) return fail(back, "failed");
  const t = await tokenRequest({
    client_id: creds.id,
    client_secret: creds.secret,
    grant_type: "authorization_code",
    code,
    redirect_uri: `${SHARED_ORIGIN}${CALLBACK_PATH}`,
  });
  if (!t.ok || typeof t.body?.refresh_token !== "string") return fail(back, "failed");
  if (!String(t.body.scope ?? "").includes("business.manage")) return fail(back, "permission");
  const saved = await serviceWrite<boolean>("rpc/repsuites_google_store_refresh", "", {
    method: "POST",
    body: { p_tenant: st.tid, p_token: t.body.refresh_token },
  });
  if (saved.error) return fail(back, "failed");

  const places = await listPlaces(String(t.body.access_token));
  const one = Array.isArray(places) && places.length === 1 ? places[0]! : null;
  await serviceWrite<unknown>("google_connections?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      tenant_id: st.tid,
      google_email: emailFromIdToken(t.body.id_token),
      account_name: one?.account ?? null,
      location_name: one?.location ?? null,
      location_title: one?.title ?? null,
      status: one ? "connected" : "choose_location",
      error: Array.isArray(places)
        ? places.length
          ? null
          : "No Business Profile found on this Google account."
        : places.error,
      connected_by: UUID_RE.test(st.uid) ? st.uid : null,
      connected_at: new Date().toISOString(),
      last_sync_at: null,
    },
  });
  if (one) await syncReviews(st.tid).catch(() => null);
  if (UUID_RE.test(st.uid)) {
    const { confirmByGoogle } = await import("./email-check.server");
    await confirmByGoogle(st.uid, emailFromIdToken(t.body.id_token)).catch(() => null);
  }
  return `${back}/dashboard?google=connected`;
}

export async function readGoogle() {
  const g = await guard(false);
  if (!g.ok) return { ok: false as const, error: g.error };
  const [c, reviews, posts] = await Promise.all([
    serviceRead<any[]>(
      `google_connections?select=google_email,location_title,status,error,last_sync_at&tenant_id=eq.${g.tenantId}`,
      "",
    ),
    serviceRead<any[]>(
      `google_reviews?select=id,reviewer,stars,comment,created_at_google,reply,reply_at,draft,error,auto_replied&tenant_id=eq.${g.tenantId}&order=created_at_google.desc.nullslast&limit=50`,
      "",
    ),
    serviceRead<any[]>(
      `google_posts?select=id,summary,action_type,action_url,publish_at,status,error,posted_at&tenant_id=eq.${g.tenantId}&status=neq.cancelled&order=publish_at.desc&limit=30`,
      "",
    ),
  ]);
  const conn = c.data?.[0] ?? null;
  return {
    ok: true as const,
    ready: googleReady(),
    canConnect: OWNERS.includes(g.role),
    replySettings: await replySettings(g.tenantId),
    reportSettings: await reportSettings(g.tenantId),
    connection: conn
      ? {
          email: conn.google_email as string | null,
          title: conn.location_title as string | null,
          status: conn.status as "connected" | "choose_location" | "needs_reconnect",
          error: conn.error as string | null,
          lastSyncAt: conn.last_sync_at as string | null,
        }
      : null,
    reviews: (reviews.data ?? []).map((r) => ({
      id: String(r.id),
      reviewer: String(r.reviewer ?? "A Google user"),
      stars: Number(r.stars ?? 0),
      comment: String(r.comment ?? ""),
      at: r.created_at_google as string | null,
      reply: (r.reply as string | null) ?? null,
      replyAt: (r.reply_at as string | null) ?? null,
      draft: (r.draft as string | null) ?? null,
      error: (r.error as string | null) ?? null,
      auto: r.auto_replied === true,
    })),
    posts: (posts.data ?? []).map((p) => ({
      id: String(p.id),
      summary: String(p.summary),
      actionType: (p.action_type as string | null) ?? null,
      actionUrl: (p.action_url as string | null) ?? null,
      publishAt: String(p.publish_at),
      status: String(p.status),
      error: (p.error as string | null) ?? null,
      postedAt: (p.posted_at as string | null) ?? null,
    })),
  };
}

export async function listGooglePlaces() {
  const g = await guard(false, true);
  if (!g.ok) return { ok: false as const, error: g.error };
  const token = await accessToken(g.tenantId);
  if (!token) return { ok: false as const, error: "Connect Google again." };
  const p = await listPlaces(token);
  if (!Array.isArray(p)) return { ok: false as const, error: p.error };
  return { ok: true as const, places: p, business: await businessName(g.tenantId) };
}

export async function chooseGooglePlace(input: { account: string; location: string }) {
  const g = await guard(true, true);
  if (!g.ok) return { ok: false as const, error: g.error };
  const token = await accessToken(g.tenantId);
  if (!token) return { ok: false as const, error: "Connect Google again." };
  const p = await listPlaces(token);
  if (!Array.isArray(p)) return { ok: false as const, error: p.error };
  const pick = p.find((x) => x.account === input.account && x.location === input.location);
  if (!pick) return { ok: false as const, error: "That profile is not on this Google account." };
  await serviceWrite<unknown>(`google_connections?tenant_id=eq.${g.tenantId}`, "", {
    method: "PATCH",
    body: {
      account_name: pick.account,
      location_name: pick.location,
      location_title: pick.title,
      status: "connected",
      error: null,
    },
  });
  await syncReviews(g.tenantId).catch(() => null);
  return { ok: true as const };
}

export async function disconnectGoogle() {
  const g = await guard(true, true);
  if (!g.ok) return { ok: false as const, error: g.error };
  tokenCache.delete(g.tenantId);
  const rt = await serviceWrite<string>("rpc/repsuites_google_refresh_for", "", {
    method: "POST",
    body: { p_tenant: g.tenantId },
  });
  // Google cancels a refresh token for the whole Google account, so revoking
  // it would also cut off every other business connected with the same
  // account. Only revoke when this is the last business using it.
  const me = await serviceRead<{ google_email: string | null }[]>(
    `google_connections?select=google_email&tenant_id=eq.${g.tenantId}`,
    "",
  );
  const email = me.data?.[0]?.google_email ?? null;
  const others = email
    ? await serviceRead<{ tenant_id: string }[]>(
        `google_connections?select=tenant_id&google_email=eq.${encodeURIComponent(email)}&tenant_id=neq.${g.tenantId}&limit=1`,
        "",
      )
    : { data: [] };
  const shared = (others.data?.length ?? 0) > 0;
  if (!shared && typeof rt.data === "string" && rt.data) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt.data)}`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
  }
  await serviceWrite<unknown>("rpc/repsuites_google_forget", "", {
    method: "POST",
    body: { p_tenant: g.tenantId },
  });
  await serviceWrite<unknown>(`google_connections?tenant_id=eq.${g.tenantId}`, "", {
    method: "DELETE",
  });
  // Google data is only kept while connected (privacy policy promise).
  await serviceWrite<unknown>(`google_reviews?tenant_id=eq.${g.tenantId}`, "", {
    method: "DELETE",
  });
  return { ok: true as const };
}

// ---------- reviews ----------

async function connectionFor(tenantId: string) {
  const c = await serviceRead<any[]>(
    `google_connections?select=account_name,location_name,location_title,status&tenant_id=eq.${tenantId}`,
    "",
  );
  const row = c.data?.[0];
  if (!row || row.status !== "connected" || !row.account_name || !row.location_name) return null;
  return {
    path: `${row.account_name}/${row.location_name}`,
    title: String(row.location_title ?? ""),
  };
}

export function reviewRow(tenantId: string, r: any) {
  return {
    tenant_id: tenantId,
    review_name: String(r.name ?? "").slice(0, 300),
    reviewer: String(r.reviewer?.displayName ?? "").slice(0, 200) || null,
    stars: STAR[String(r.starRating ?? "")] ?? null,
    comment: typeof r.comment === "string" ? r.comment.slice(0, 5000) : null,
    created_at_google: r.createTime ?? null,
    updated_at_google: r.updateTime ?? null,
    reply: typeof r.reviewReply?.comment === "string" ? r.reviewReply.comment.slice(0, 4096) : null,
    reply_at: r.reviewReply?.updateTime ?? null,
    synced_at: new Date().toISOString(),
  };
}

export async function syncReviews(tenantId: string) {
  const conn = await connectionFor(tenantId);
  if (!conn) return { ok: false as const, error: "Google is not connected." };
  const token = await accessToken(tenantId);
  if (!token) return { ok: false as const, error: "Connect Google again." };
  const r = await google(
    token,
    `https://mybusiness.googleapis.com/v4/${conn.path}/reviews?pageSize=50&orderBy=updateTime%20desc`,
  );
  if (!r.ok) {
    const err = googleError(r);
    await serviceWrite<unknown>(`google_connections?tenant_id=eq.${tenantId}`, "", {
      method: "PATCH",
      body: { error: err, last_sync_at: new Date().toISOString() },
    });
    return { ok: false as const, error: err };
  }
  const rows = (r.data?.reviews ?? [])
    .map((x: any) => reviewRow(tenantId, x))
    .filter((x: any) => x.review_name);
  if (rows.length)
    await serviceWrite<unknown>("google_reviews?on_conflict=review_name", "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: rows,
    });
  await serviceWrite<unknown>(`google_connections?tenant_id=eq.${tenantId}`, "", {
    method: "PATCH",
    body: { error: null, last_sync_at: new Date().toISOString() },
  });
  const handled = await handleNewReviews(tenantId).catch(() => ({ drafted: 0, replied: 0 }));
  return { ok: true as const, count: rows.length, ...handled };
}

export async function refreshGoogleReviews() {
  const g = await guard(true);
  if (!g.ok) return { ok: false as const, error: g.error };
  return syncReviews(g.tenantId);
}

async function reviewFor(tenantId: string, id: string) {
  if (!UUID_RE.test(id)) return null;
  const r = await serviceRead<any[]>(
    `google_reviews?select=id,review_name,reviewer,stars,comment&id=eq.${id}&tenant_id=eq.${tenantId}`,
    "",
  );
  return r.data?.[0] ?? null;
}

// ---------- reply settings and automatic replies ----------

export type ReplyMode = "off" | "suggest" | "auto";

export interface ReplySettings extends ReplyTemplates {
  mode: ReplyMode;
  autoMinStars: number;
  modeSince: string;
}

export async function replySettings(tenantId: string): Promise<ReplySettings> {
  const r = await serviceRead<any[]>(
    `google_reply_settings?select=mode,auto_min_stars,mode_since,template_positive,template_neutral,template_negative,about&tenant_id=eq.${tenantId}`,
    "",
  );
  const x = r.data?.[0];
  return {
    mode: x?.mode === "suggest" || x?.mode === "auto" ? x.mode : "off",
    autoMinStars: Number(x?.auto_min_stars ?? 4),
    modeSince: String(x?.mode_since ?? new Date().toISOString()),
    positive: x?.template_positive || DEFAULT_TEMPLATES.positive,
    neutral: x?.template_neutral || DEFAULT_TEMPLATES.neutral,
    negative: x?.template_negative || DEFAULT_TEMPLATES.negative,
    about: x?.about || "",
  };
}

export function validateReplySettings(s: {
  mode: string;
  autoMinStars: number;
  positive: string;
  neutral: string;
  negative: string;
  about: string;
}): string | null {
  if (!["off", "suggest", "auto"].includes(s.mode)) return "Choose how replies are handled.";
  if (!(Number.isInteger(s.autoMinStars) && s.autoMinStars >= 3 && s.autoMinStars <= 5))
    return "Automatic replies can be for 3, 4 or 5 star reviews and above.";
  for (const t of [s.positive, s.neutral, s.negative]) {
    if (t.trim().length < 20 || t.length > 1500)
      return "Each template needs 20 to 1,500 characters.";
    if (/[\u2014\u2013]/.test(t)) return "Please use a normal hyphen instead of long dashes.";
  }
  if (s.about.length > 1000) return "Keep the note about your business under 1,000 characters.";
  return null;
}

export async function saveGoogleReplySettings(input: {
  mode: ReplyMode;
  autoMinStars: number;
  positive: string;
  neutral: string;
  negative: string;
  about: string;
}) {
  const g = await guard(true, true);
  if (!g.ok) return { ok: false as const, error: g.error };
  if (input.mode !== "off") {
    const paid = await growthBlocked(g);
    if (paid) return { ok: false as const, error: paid };
  }
  const bad = validateReplySettings(input);
  if (bad) return { ok: false as const, error: bad };
  const before = await replySettings(g.tenantId);
  const w = await serviceWrite<unknown>("google_reply_settings?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      tenant_id: g.tenantId,
      mode: input.mode,
      auto_min_stars: input.autoMinStars,
      // Only reviews that arrive from now on are handled automatically.
      ...(before.mode !== input.mode ? { mode_since: new Date().toISOString() } : {}),
      template_positive: input.positive.trim(),
      template_neutral: input.neutral.trim(),
      template_negative: input.negative.trim(),
      about: input.about.trim() || null,
      updated_by: g.userId,
      updated_at: new Date().toISOString(),
    },
  });
  if (w.error) return { ok: false as const, error: "Could not save the settings." };
  return { ok: true as const };
}

async function businessName(tenantId: string) {
  const t = await serviceRead<{ name: string }[]>(`tenants?select=name&id=eq.${tenantId}`, "");
  return t.data?.[0]?.name ?? "";
}

async function draftFor(tenantId: string, rev: any, settings: ReplySettings, business: string) {
  return draftReviewReply(
    {
      business,
      reviewer: String(rev.reviewer ?? ""),
      stars: Number(rev.stars ?? 5),
      comment: String(rev.comment ?? ""),
    },
    settings,
  );
}

async function postReply(
  tenantId: string,
  rev: { id: string; review_name: string },
  text: string,
  auto: boolean,
) {
  const token = await accessToken(tenantId);
  if (!token) return { ok: false as const, error: "Connect Google again." };
  const r = await google(token, `https://mybusiness.googleapis.com/v4/${rev.review_name}/reply`, {
    method: "PUT",
    body: { comment: text },
  });
  if (!r.ok) {
    const err = googleError(r);
    await serviceWrite<unknown>(`google_reviews?id=eq.${rev.id}`, "", {
      method: "PATCH",
      body: { draft: text, error: err },
    });
    return { ok: false as const, error: err };
  }
  await serviceWrite<unknown>(`google_reviews?id=eq.${rev.id}`, "", {
    method: "PATCH",
    body: {
      reply: text,
      reply_at: new Date().toISOString(),
      draft: null,
      error: null,
      auto_replied: auto,
    },
  });
  return { ok: true as const };
}

// After each sync: drafts (and, in auto mode, replies) for new reviews.
// A few per run, oldest first, only reviews that came in after the mode
// was switched on.
export async function handleNewReviews(tenantId: string, limit = 3) {
  const settings = await replySettings(tenantId);
  if (settings.mode === "off") return { drafted: 0, replied: 0 };
  // AI drafts and automatic replies are part of RepSuites Growth.
  const { tenantHasFeatureService } = await import("./tenant-access.server");
  if (!(await tenantHasFeatureService(tenantId, "growth"))) return { drafted: 0, replied: 0 };
  const r = await serviceRead<any[]>(
    `google_reviews?select=id,review_name,reviewer,stars,comment&tenant_id=eq.${tenantId}` +
      `&reply=is.null&draft=is.null&created_at_google=gte.${settings.modeSince}&order=created_at_google.asc&limit=${limit}`,
    "",
  );
  const list = r.data ?? [];
  if (!list.length) return { drafted: 0, replied: 0 };
  const business = await businessName(tenantId);
  let drafted = 0;
  let replied = 0;
  for (const rev of list) {
    const text = await draftFor(tenantId, rev, settings, business);
    if (settings.mode === "auto" && Number(rev.stars ?? 0) >= settings.autoMinStars) {
      if ((await postReply(tenantId, rev, text, true)).ok) replied++;
    } else {
      await serviceWrite<unknown>(`google_reviews?id=eq.${rev.id}`, "", {
        method: "PATCH",
        body: { draft: text },
      });
      drafted++;
    }
  }
  return { drafted, replied };
}

export async function draftGoogleReply(input: { id: string }) {
  const g = await guard(true);
  if (!g.ok) return { ok: false as const, error: g.error };
  const paid = await growthBlocked(g);
  if (paid) return { ok: false as const, error: paid };
  const rev = await reviewFor(g.tenantId, input.id);
  if (!rev) return { ok: false as const, error: "Unknown review." };
  const [settings, business] = await Promise.all([
    replySettings(g.tenantId),
    businessName(g.tenantId),
  ]);
  const draft = await draftFor(g.tenantId, rev, settings, business);
  // Say so when the AI could not write it and the template was used instead.
  const problem = lastDraftProblem
    ? `Written from your template because the AI was unavailable (${lastDraftProblem}).`
    : null;
  await serviceWrite<unknown>(`google_reviews?id=eq.${rev.id}`, "", {
    method: "PATCH",
    body: { draft, error: problem },
  });
  return { ok: true as const, draft };
}

export async function postGoogleReply(input: { id: string; text: string }) {
  const g = await guard(true);
  if (!g.ok) return { ok: false as const, error: g.error };
  const paid = await growthBlocked(g);
  if (paid) return { ok: false as const, error: paid };
  const text = String(input.text ?? "").trim();
  if (text.length < 2 || text.length > 4000)
    return { ok: false as const, error: "Write a reply of up to 4,000 characters." };
  const rev = await reviewFor(g.tenantId, input.id);
  if (!rev) return { ok: false as const, error: "Unknown review." };
  return postReply(g.tenantId, rev, text, false);
}

// ---------- posts ----------

export function validatePost(input: {
  summary: string;
  actionType?: string | null | undefined;
  actionUrl?: string | null | undefined;
  publishAt?: string | null | undefined;
}) {
  const summary = String(input.summary ?? "").trim();
  if (summary.length < 10 || summary.length > 1500)
    return "Write a post of 10 to 1,500 characters.";
  if (/\b(?:\+?44|0)7\d{3}\s?\d{6}\b/.test(summary))
    return "Google does not allow phone numbers in the post text. Use the Call button instead.";
  const at = input.actionType ?? null;
  if (at && !["BOOK", "LEARN_MORE", "CALL", "SIGN_UP"].includes(at)) return "Unknown button.";
  if (at && at !== "CALL" && !/^https:\/\/\S{4,490}$/.test(String(input.actionUrl ?? "")))
    return "Add the web address for the button (starting https://).";
  if (input.publishAt) {
    const t = Date.parse(input.publishAt);
    if (!Number.isFinite(t)) return "Choose a valid time.";
    if (t > Date.now() + 90 * 86400000) return "Schedule up to 90 days ahead.";
  }
  return null;
}

export async function createGooglePost(input: {
  summary: string;
  actionType?: string | null | undefined;
  actionUrl?: string | null | undefined;
  publishAt?: string | null | undefined;
}) {
  const g = await guard(true);
  if (!g.ok) return { ok: false as const, error: g.error };
  const paid = await growthBlocked(g);
  if (paid) return { ok: false as const, error: paid };
  const bad = validatePost(input);
  if (bad) return { ok: false as const, error: bad };
  if (!(await connectionFor(g.tenantId)))
    return { ok: false as const, error: "Connect your Google profile first." };
  const publishAt =
    input.publishAt && Date.parse(input.publishAt) > Date.now() + 60000
      ? new Date(input.publishAt).toISOString()
      : new Date().toISOString();
  const w = await serviceWrite<any[]>("google_posts", "", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      tenant_id: g.tenantId,
      summary: input.summary.trim(),
      action_type: input.actionType ?? null,
      action_url: input.actionType && input.actionType !== "CALL" ? input.actionUrl : null,
      publish_at: publishAt,
      created_by: g.userId,
    },
  });
  const row = w.data?.[0];
  if (!row) return { ok: false as const, error: "Could not save the post." };
  if (Date.parse(publishAt) <= Date.now() + 60000) {
    const r = await publishPost(row);
    return r.ok ? { ok: true as const, posted: true } : { ok: false as const, error: r.error };
  }
  return { ok: true as const, posted: false };
}

export async function cancelGooglePost(input: { id: string }) {
  const g = await guard(true);
  if (!g.ok) return { ok: false as const, error: g.error };
  if (!UUID_RE.test(input.id)) return { ok: false as const, error: "Unknown post." };
  await serviceWrite<unknown>(
    `google_posts?id=eq.${input.id}&tenant_id=eq.${g.tenantId}&status=in.(scheduled,failed)`,
    "",
    {
      method: "PATCH",
      body: { status: "cancelled" },
    },
  );
  return { ok: true as const };
}

async function publishPost(row: any): Promise<{ ok: true } | { ok: false; error: string }> {
  const conn = await connectionFor(row.tenant_id);
  const token = conn ? await accessToken(row.tenant_id) : null;
  let error: string | null = null;
  let name: string | null = null;
  if (!conn || !token) error = "Google is not connected.";
  else {
    const r = await google(token, `https://mybusiness.googleapis.com/v4/${conn.path}/localPosts`, {
      method: "POST",
      body: {
        languageCode: "en-GB",
        topicType: "STANDARD",
        summary: row.summary,
        ...(row.action_type
          ? {
              callToAction: {
                actionType: row.action_type,
                ...(row.action_url ? { url: row.action_url } : {}),
              },
            }
          : {}),
      },
    });
    if (r.ok) name = String(r.data?.name ?? "").slice(0, 300) || null;
    else error = googleError(r);
  }
  await serviceWrite<unknown>(`google_posts?id=eq.${row.id}`, "", {
    method: "PATCH",
    body: error
      ? { status: "failed", error }
      : { status: "posted", google_name: name, posted_at: new Date().toISOString(), error: null },
  });
  return error ? { ok: false, error } : { ok: true };
}

// ---------- every 30 minutes ----------

export async function runGoogleSync(token: string) {
  if (!hasServiceRole()) return { status: 503, body: { ok: false } };
  const okTok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
    method: "POST",
    body: { p_token: token },
  });
  if (okTok.error || okTok.data !== true) return { status: 401, body: { ok: false } };
  if (!clientCreds()) return { status: 200, body: { ok: true, skipped: "not set up" } };

  // Up to 3 due posts, then reviews (and automatic replies) for the business
  // synced longest ago. Runs every 10 minutes; Cloudflare allows 50 outgoing
  // requests per run, so one business at a time.
  const due = await serviceRead<any[]>(
    `google_posts?select=id,tenant_id,summary,action_type,action_url&status=eq.scheduled&publish_at=lte.${new Date().toISOString()}&order=publish_at.asc&limit=3`,
    "",
  );
  let posted = 0;
  for (const p of due.data ?? []) if ((await publishPost(p)).ok) posted++;
  const stale = new Date(Date.now() - 25 * 60000).toISOString();
  const conns = await serviceRead<{ tenant_id: string }[]>(
    `google_connections?select=tenant_id&status=eq.connected&or=(last_sync_at.is.null,last_sync_at.lt.${stale})&order=last_sync_at.asc.nullsfirst&limit=1`,
    "",
  );
  let synced = 0;
  for (const c of conns.data ?? []) if ((await syncReviews(c.tenant_id)).ok) synced++;
  return { status: 200, body: { ok: true, posted, synced } };
}

// ---------- performance report ----------

export async function readGooglePerformance() {
  const g = await guard(false);
  if (!g.ok) return { ok: false as const, error: g.error };
  const { periods } = await import("./google-performance");
  const now = new Date();
  return performanceFor(
    g.tenantId,
    periods(now),
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
  );
}

// Daily figures from p.start to p.end and the search words for wordsMonth,
// for one location, with any access token that can read it.
export async function fetchMetrics(
  token: string,
  location: string,
  p: { start: string; end: string },
  wordsMonth: Date,
) {
  const { DAILY_METRICS } = await import("./google-performance");
  const [y1, m1, d1] = p.start.split("-").map(Number);
  const [y2, m2, d2] = p.end.split("-").map(Number);
  const q = new URLSearchParams();
  for (const m of DAILY_METRICS) q.append("dailyMetrics", m);
  q.set("dailyRange.start_date.year", String(y1));
  q.set("dailyRange.start_date.month", String(m1));
  q.set("dailyRange.start_date.day", String(d1));
  q.set("dailyRange.end_date.year", String(y2));
  q.set("dailyRange.end_date.month", String(m2));
  q.set("dailyRange.end_date.day", String(d2));
  const lm = wordsMonth;
  const k = new URLSearchParams({
    "monthlyRange.start_month.year": String(lm.getUTCFullYear()),
    "monthlyRange.start_month.month": String(lm.getUTCMonth() + 1),
    "monthlyRange.end_month.year": String(lm.getUTCFullYear()),
    "monthlyRange.end_month.month": String(lm.getUTCMonth() + 1),
    pageSize: "100",
  });
  const [metrics, words] = await Promise.all([
    google(
      token,
      `https://businessprofileperformance.googleapis.com/v1/${location}:fetchMultiDailyMetricsTimeSeries?${q}`,
    ),
    google(
      token,
      `https://businessprofileperformance.googleapis.com/v1/${location}/searchkeywords/impressions/monthly?${k}`,
    ),
  ]);
  return { metrics, words };
}

// Figures for one business: daily totals from p.start to p.end split at
// p.split, and the search words for the month starting wordsMonth.
export async function performanceFor(
  tenantId: string,
  p: { start: string; split: string; end: string },
  wordsMonth: Date,
) {
  const c = await serviceRead<any[]>(
    `google_connections?select=location_name,location_title,status&tenant_id=eq.${tenantId}`,
    "",
  );
  const conn = c.data?.[0];
  if (!conn || conn.status !== "connected" || !conn.location_name)
    return { ok: false as const, error: "Connect your Google profile first." };
  const token = await accessToken(tenantId);
  if (!token) return { ok: false as const, error: "Connect Google again." };
  const { summarise, searchTerms } = await import("./google-performance");
  const [{ metrics, words }, reviews] = await Promise.all([
    fetchMetrics(token, conn.location_name, p, wordsMonth),
    serviceRead<{ stars: number | null; created_at_google: string | null }[]>(
      `google_reviews?select=stars,created_at_google&tenant_id=eq.${tenantId}&created_at_google=gte.${p.start}`,
      "",
    ),
  ]);
  const lm = wordsMonth;
  if (!metrics.ok) return { ok: false as const, error: googleError(metrics) };
  const { current, previous } = summarise(metrics.data, p.split);
  const rv = reviews.data ?? [];
  const inPeriod = (from: string, to: string) =>
    rv.filter(
      (r) =>
        r.created_at_google &&
        r.created_at_google.slice(0, 10) >= from &&
        r.created_at_google.slice(0, 10) <= to,
    );
  const dayBefore = new Date(Date.parse(`${p.split}T12:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  const nowList = inPeriod(p.split, p.end);
  const beforeList = inPeriod(p.start, dayBefore);
  const avg = (list: typeof rv) => {
    const s = list.filter((r) => r.stars);
    return s.length
      ? Math.round((s.reduce((t, r) => t + (r.stars ?? 0), 0) / s.length) * 10) / 10
      : null;
  };
  return {
    ok: true as const,
    title: String(conn.location_title ?? ""),
    period: p,
    current,
    previous,
    reviews: {
      now: nowList.length,
      before: beforeList.length,
      avgNow: avg(nowList),
      avgBefore: avg(beforeList),
    },
    searchMonth: lm.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    searchTerms: words.ok ? searchTerms(words.data) : [],
  };
}

// ---------- monthly report email ----------

export async function reportSettings(tenantId: string) {
  const r = await serviceRead<any[]>(
    `google_report_settings?select=enabled,email,last_sent_month,last_error&tenant_id=eq.${tenantId}`,
    "",
  );
  const x = r.data?.[0];
  return {
    enabled: x?.enabled === true,
    email: (x?.email as string | null) ?? "",
    lastSentMonth: (x?.last_sent_month as string | null) ?? null,
    lastError: (x?.last_error as string | null) ?? null,
  };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function saveGoogleReportSettings(input: { enabled: boolean; email: string }) {
  const g = await guard(true, true);
  if (!g.ok) return { ok: false as const, error: g.error };
  if (input.enabled) {
    const paid = await growthBlocked(g);
    if (paid) return { ok: false as const, error: paid };
    const { emailUnconfirmed } = await import("./email-check.server");
    const unconfirmed = await emailUnconfirmed(g.userId);
    if (unconfirmed) return { ok: false as const, error: unconfirmed };
  }
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase();
  if (input.enabled && !EMAIL_RE.test(email))
    return { ok: false as const, error: "Enter the email address to send the report to." };
  if (email && (email.length > 320 || !EMAIL_RE.test(email)))
    return { ok: false as const, error: "That email address does not look right." };
  const w = await serviceWrite<unknown>("google_report_settings?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      tenant_id: g.tenantId,
      enabled: input.enabled === true,
      email: email || null,
      updated_by: g.userId,
      updated_at: new Date().toISOString(),
    },
  });
  if (w.error) return { ok: false as const, error: "Could not save the settings." };
  return { ok: true as const };
}

async function sendReport(tenantId: string, email: string, today: Date) {
  const { monthPeriods, reportHtml, reportSubject, reportText } = await import("./google-report");
  const mp = monthPeriods(today);
  const perf = await performanceFor(tenantId, mp, mp.month);
  if (!perf.ok) return { ok: false as const, error: perf.error, key: mp.key };
  const data = {
    business: await businessName(tenantId),
    title: perf.title,
    monthLabel: perf.searchMonth,
    current: perf.current,
    previous: perf.previous,
    reviews: perf.reviews,
    searchTerms: perf.searchTerms,
  };
  const { sendEmail } = await import("./email.server");
  // Customer Insights section: rebuilt for the report when there is enough
  // written feedback; left out quietly otherwise.
  let insightsSection = "";
  try {
    const { buildInsights } = await import("./insights.server");
    const { insightsHtml } = await import("./insights");
    const ins = await buildInsights(tenantId, data.business);
    if (ins.summary) insightsSection = insightsHtml(ins.summary);
  } catch {
    insightsSection = "";
  }
  const r = await sendEmail({
    to: email,
    subject: reportSubject(data),
    html: insightsSection
      ? reportHtml(data).replace(/<\/div>$/, `${insightsSection}</div>`)
      : reportHtml(data),
    text: reportText(data),
  });
  return r.ok
    ? { ok: true as const, key: mp.key }
    : { ok: false as const, error: r.error, key: mp.key };
}

export async function sendTestGoogleReport() {
  const g = await guard(true, true);
  if (!g.ok) return { ok: false as const, error: g.error };
  const paid = await growthBlocked(g);
  if (paid) return { ok: false as const, error: paid };
  const s = await reportSettings(g.tenantId);
  if (!EMAIL_RE.test(s.email)) return { ok: false as const, error: "Save an email address first." };
  const r = await sendReport(g.tenantId, s.email, new Date());
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

export async function runGoogleReports(token: string) {
  if (!hasServiceRole()) return { status: 503, body: { ok: false } };
  const okTok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
    method: "POST",
    body: { p_token: token },
  });
  if (okTok.error || okTok.data !== true) return { status: 401, body: { ok: false } };
  const { monthPeriods } = await import("./google-report");
  const key = monthPeriods(new Date()).key;
  const due = await serviceRead<any[]>(
    `google_report_settings?select=tenant_id,email&enabled=eq.true&email=not.is.null&or=(last_sent_month.is.null,last_sent_month.neq.${key})&limit=3`,
    "",
  );
  let sent = 0;
  for (const d of due.data ?? []) {
    const r = await sendReport(d.tenant_id, d.email, new Date());
    await serviceWrite<unknown>(`google_report_settings?tenant_id=eq.${d.tenant_id}`, "", {
      method: "PATCH",
      // Mark the month either way so a broken connection is not retried
      // every hour; the error shows on the Reviews page.
      body: { last_sent_month: key, last_error: r.ok ? null : r.error.slice(0, 290) },
    });
    if (r.ok) sent++;
  }
  return { status: 200, body: { ok: true, sent } };
}

// ---------- profile basics for ranking checks ----------

// The connected profile's Google place ID, map position and name.
export async function profileBasics(tenantId: string): Promise<{
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  title: string;
} | null> {
  const c = await serviceRead<any[]>(
    `google_connections?select=location_name,location_title,status&tenant_id=eq.${tenantId}`,
    "",
  );
  const conn = c.data?.[0];
  if (!conn || conn.status !== "connected" || !conn.location_name) return null;
  const token = await accessToken(tenantId);
  if (!token) return null;
  const r = await google(
    token,
    `https://mybusinessbusinessinformation.googleapis.com/v1/${conn.location_name}?readMask=title,latlng,metadata`,
  );
  if (!r.ok) return null;
  const lat = Number(r.data?.latlng?.latitude);
  const lng = Number(r.data?.latlng?.longitude);
  return {
    placeId: typeof r.data?.metadata?.placeId === "string" ? r.data.metadata.placeId : null,
    lat: Number.isFinite(lat) && r.data?.latlng ? lat : null,
    lng: Number.isFinite(lng) && r.data?.latlng ? lng : null,
    title: String(r.data?.title ?? conn.location_title ?? ""),
  };
}

// ---------- customer insights ----------

export async function readInsights() {
  const g = await guard(false);
  if (!g.ok) return { ok: false as const, error: g.error };
  const paid = await growthBlocked(g);
  if (paid) return { ok: false as const, error: paid };
  const { latestInsights } = await import("./insights.server");
  return { ok: true as const, insights: await latestInsights(g.tenantId) };
}

// At most once an hour per business, so a click-happy owner cannot run up
// AI costs.
export async function refreshInsights() {
  const g = await guard(true);
  if (!g.ok) return { ok: false as const, error: g.error };
  const paid = await growthBlocked(g);
  if (paid) return { ok: false as const, error: paid };
  const { latestInsights, buildInsights } = await import("./insights.server");
  const last = await latestInsights(g.tenantId);
  if (last && Date.now() - Date.parse(last.createdAt) < 3600_000 && last.summary)
    return { ok: true as const, insights: last };
  const insights = await buildInsights(g.tenantId, await businessName(g.tenantId));
  return { ok: true as const, insights };
}
