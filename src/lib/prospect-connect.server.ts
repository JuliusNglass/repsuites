/* eslint-disable @typescript-eslint/no-explicit-any -- Google JSON is checked field by field. */
// Server-only: a prospect adds their real Google profile figures to the free
// report (/r/<token>) by signing in with Google once.
//
// 1. "See my real numbers" on the report sends them to Google sign-in with a
//    sealed state naming the report (kind "prospect").
// 2. The callback reads the last 3 months of figures with the one-hour
//    access token, saves the figures on the prospect and keeps NO token, so
//    we hold no access afterwards. Their Google account lists RepSuites
//    until they remove it there.
// 3. If the account has several profiles and none matches the report's
//    business by name, they pick one on a short page.
// No em dashes in this copy (AGENTS.md).
import { getSupabaseConfig } from "./config.server";
import { sendEmail } from "./email.server";
import {
  AUTH_URL,
  CALLBACK_PATH,
  clientCreds,
  emailFromIdToken,
  fetchMetrics,
  googleError,
  listPlaces,
  tokenRequest,
  type Place,
} from "./google-business.server";
import { decryptSessionData, encryptSessionData } from "./session.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { SHARED_ORIGIN } from "./tenant-links.server";
import { sameBusiness } from "./ai-visibility";
import type { PerfTotals, SearchTerm } from "./google-performance";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const MAX_AGE_MS = 30 * 60 * 1000;

export interface ProspectSnapshot {
  at: string;
  title: string;
  period: { start: string; split: string; end: string };
  current: PerfTotals;
  previous: PerfTotals;
  searchMonth: string;
  searchTerms: SearchTerm[];
}

interface PState {
  kind: "prospect";
  r: string;
  exp: number;
}

interface PickState {
  kind: "pick";
  r: string;
  at: string; // Google access token (lasts about an hour)
  email: string | null;
  places: Place[];
  exp: number;
}

const reportUrl = (r: string, q = "") => `${SHARED_ORIGIN}/r/${r}${q ? `?${q}` : ""}`;

// Last 90 full days (Google is a few days behind) and the 90 before.
export function prospectPeriod(today: Date) {
  const day = 86400000;
  const end = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - 3 * day,
  );
  const split = new Date(end.getTime() - 89 * day);
  const start = new Date(split.getTime() - 90 * day);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), split: iso(split), end: iso(end) };
}

async function prospectByToken(r: string) {
  if (!TOKEN_RE.test(r)) return null;
  const p = await serviceRead<{ id: string; name: string; report: any }[]>(
    `prospects?select=id,name,report&report_token=eq.${r}`,
    "",
  );
  const row = p.data?.[0];
  return row?.report ? row : null;
}

// Step 1: where "See my real numbers" sends the browser.
export async function prospectConnectUrl(r: string): Promise<string> {
  const creds = clientCreds();
  const cfg = getSupabaseConfig();
  if (!creds || !cfg.isConfigured || !(await prospectByToken(r)))
    return TOKEN_RE.test(r) ? reportUrl(r, "google=unavailable") : `${SHARED_ORIGIN}/`;
  const state = await encryptSessionData(
    { kind: "prospect", r, exp: Date.now() + MAX_AGE_MS } satisfies PState,
    cfg.sessionSecret,
  );
  const q = new URLSearchParams({
    client_id: creds.id,
    redirect_uri: `${SHARED_ORIGIN}${CALLBACK_PATH}`,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/business.manage",
    // Online access: Google gives no refresh token, so nothing lasts.
    access_type: "online",
    prompt: "select_account consent",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

// Step 2: the shared Google callback hands over here first. Returns null if
// this sign-in was not a prospect's (then the normal connect flow runs).
export async function finishProspectConnect(params: URLSearchParams): Promise<string | null> {
  const cfg = getSupabaseConfig();
  const raw = params.get("state") ?? "";
  if (!raw || raw.length > 2000 || !cfg.isConfigured) return null;
  const st = await decryptSessionData<PState>(raw, cfg.sessionSecret).catch(() => null);
  if (!st || st.kind !== "prospect" || typeof st.r !== "string" || !TOKEN_RE.test(st.r))
    return null;
  if (!(st.exp > Date.now())) return reportUrl(st.r, "google=expired");
  if (params.get("error")) return reportUrl(st.r, "google=cancelled");
  const code = params.get("code");
  const creds = clientCreds();
  if (!code || !creds) return reportUrl(st.r, "google=failed");
  const t = await tokenRequest({
    client_id: creds.id,
    client_secret: creds.secret,
    grant_type: "authorization_code",
    code,
    redirect_uri: `${SHARED_ORIGIN}${CALLBACK_PATH}`,
  });
  if (!t.ok || typeof t.body?.access_token !== "string") return reportUrl(st.r, "google=failed");
  if (!String(t.body.scope ?? "").includes("business.manage"))
    return reportUrl(st.r, "google=permission");
  const token = String(t.body.access_token);
  const email = emailFromIdToken(t.body.id_token);
  const prospect = await prospectByToken(st.r);
  if (!prospect) return `${SHARED_ORIGIN}/`;
  const places = await listPlaces(token);
  if (!Array.isArray(places) || !places.length) return reportUrl(st.r, "google=noprofile");
  const matches = places.filter((p) => sameBusiness(p.title, prospect.name));
  const pick = places.length === 1 ? places[0]! : matches.length === 1 ? matches[0]! : null;
  if (pick) return saveSnapshot(st.r, prospect, token, email, pick);
  const sealed = await encryptSessionData(
    {
      kind: "pick",
      r: st.r,
      at: token,
      email,
      places: places.slice(0, 30),
      exp: Date.now() + MAX_AGE_MS,
    } satisfies PickState,
    cfg.sessionSecret,
  );
  return `${SHARED_ORIGIN}/api/prospect-connect?pick=${encodeURIComponent(sealed)}`;
}

// Step 3 (only with several profiles): the chooser page, and its answer.
export async function readPick(sealed: string): Promise<PickState | null> {
  const cfg = getSupabaseConfig();
  if (!sealed || sealed.length > 20000 || !cfg.isConfigured) return null;
  const st = await decryptSessionData<PickState>(sealed, cfg.sessionSecret).catch(() => null);
  return st && st.kind === "pick" && TOKEN_RE.test(st.r) && st.exp > Date.now() ? st : null;
}

export async function finishPick(sealed: string, index: number): Promise<string> {
  const st = await readPick(sealed);
  if (!st) return `${SHARED_ORIGIN}/`;
  const place = st.places[index];
  const prospect = await prospectByToken(st.r);
  if (!place || !prospect) return reportUrl(st.r, "google=failed");
  return saveSnapshot(st.r, prospect, st.at, st.email, place);
}

async function saveSnapshot(
  r: string,
  prospect: { id: string; name: string },
  token: string,
  email: string | null,
  place: Place,
): Promise<string> {
  const { summarise, searchTerms } = await import("./google-performance");
  const now = new Date();
  const p = prospectPeriod(now);
  const wordsMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const { metrics, words } = await fetchMetrics(token, place.location, p, wordsMonth);
  if (!metrics.ok) {
    console.error("[prospect-connect] metrics", googleError(metrics));
    return reportUrl(r, "google=failed");
  }
  const { current, previous } = summarise(metrics.data, p.split);
  const snap: ProspectSnapshot = {
    at: now.toISOString(),
    title: place.title,
    period: p,
    current,
    previous,
    searchMonth: wordsMonth.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    searchTerms: words.ok ? searchTerms(words.data, 8) : [],
  };
  await serviceWrite(`prospects?id=eq.${prospect.id}`, "", {
    method: "PATCH",
    body: { gbp_snapshot: snap, gbp_connected_at: snap.at, updated_at: snap.at },
  });
  const to = (process.env["REPSUITES_LEADS_TO"] ?? "").trim() || "julius@accelur8.com";
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  await sendEmail({
    to,
    subject: `Warm lead: ${prospect.name} connected their Google profile`,
    html: `<p><b>${esc(prospect.name)}</b> signed in with Google from their report to see their real numbers.</p>
<p>Last 90 days: ${current.searchViews + current.mapsViews} profile views, ${current.calls} calls, ${current.directions} direction requests, ${current.websiteClicks} website clicks.</p>
<p>Google account: ${esc(email ?? "not shared")}<br>Profile: ${esc(place.title)}</p>
<p><a href="${reportUrl(r)}">Open their report</a>. This is a good moment to call.</p>`,
  }).catch(() => null);
  return reportUrl(r, "google=connected");
}

// The chooser page (plain HTML, same look as the report).
export function pickPage(st: PickState, sealed: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/favicon.png?v=2" type="image/png"><title>Choose your business</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6faf9;color:#0f172a}main{max-width:36rem;margin:0 auto;padding:28px 18px}button{display:block;width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin:8px 0;font:inherit;cursor:pointer}button:hover{border-color:#f5b324}small{color:#64748b}</style></head><body><main>
<h1 style="font-size:1.4rem">Which business is yours?</h1><p><small>Your Google account looks after more than one profile. Pick the one this report is about.</small></p>
<form method="post" action="/api/prospect-connect"><input type="hidden" name="pick" value="${esc(sealed)}">
${st.places.map((p, i) => `<button name="i" value="${i}"><b>${esc(p.title)}</b><br><small>${esc(p.address)}</small></button>`).join("")}
</form></main></body></html>`;
}
