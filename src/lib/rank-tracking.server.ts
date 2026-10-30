/* eslint-disable @typescript-eslint/no-explicit-any -- DataForSEO and PostgREST JSON is checked field by field. */
// Server-only: local ranking checks with DataForSEO's Google Maps results.
//
// Needs DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD on the server. A monthly
// spending cap across all businesses (DATAFORSEO_MONTHLY_LIMIT_USD, default
// $20) stops checks before costs run away.
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { hasServiceRole, serviceRead, serviceWrite } from "./supabase-service.server";
import { featureBlockedFor } from "./tenant-access.server";
import { cleanKeyword, gridPoints, rankIn, summarisePoints, type GridPoint } from "./rank-grid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNERS = ["owner", "admin", "super_admin"];
const VIEW = ["owner", "admin", "super_admin", "manager"];
export const MAX_KEYWORDS = 5;
const WEEK = 7 * 86400000;
const ENDPOINT = "https://api.dataforseo.com/v3/serp/google/maps/live/advanced";

export function creds(): string | null {
  const login = (process.env["REPSUITES_DATAFORSEO_LOGIN"] ?? "").trim();
  const password = (process.env["REPSUITES_DATAFORSEO_PASSWORD"] ?? "").trim();
  return login && password ? btoa(`${login}:${password}`) : null;
}
export function rankingReady(): boolean {
  return creds() !== null && hasServiceRole();
}
function monthlyLimit(): number {
  const n = Number(process.env["REPSUITES_DATAFORSEO_MONTHLY_LIMIT_USD"] ?? "20");
  return Number.isFinite(n) && n > 0 ? n : 20;
}

async function guard(write: boolean, owners: boolean) {
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
  const blocked = await featureBlockedFor(g.session.access_token, tenantId, "ranking");
  if (blocked) return { ok: false as const, error: blocked };
  if (write && !(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Invalid request origin" };
  return { ok: true as const, tenantId, userId: g.session.user_id, role };
}

export async function readRanking() {
  const g = await guard(false, false);
  if (!g.ok) return { ok: false as const, error: g.error };
  const [s, k, scans] = await Promise.all([
    serviceRead<any[]>(`rank_settings?select=*&tenant_id=eq.${g.tenantId}`, ""),
    serviceRead<any[]>(
      `rank_keywords?select=id,keyword,active,next_run_at&tenant_id=eq.${g.tenantId}&order=created_at.asc`,
      "",
    ),
    serviceRead<any[]>(
      `rank_scans?select=id,keyword_id,run_at,grid_size,spacing_km,points,found,average_rank&tenant_id=eq.${g.tenantId}&order=run_at.desc&limit=60`,
      "",
    ),
  ]);
  const st = s.data?.[0];
  const byKeyword = new Map<string, any[]>();
  for (const sc of scans.data ?? [])
    byKeyword.set(sc.keyword_id, [...(byKeyword.get(sc.keyword_id) ?? []), sc]);
  return {
    ok: true as const,
    ready: rankingReady(),
    canEdit: OWNERS.includes(g.role),
    settings: {
      enabled: st?.enabled === true,
      gridSize: Number(st?.grid_size ?? 5),
      spacingKm: Number(st?.spacing_km ?? 1.5),
      hasCentre: st?.center_lat != null,
      lat: st?.center_lat == null ? null : Number(st.center_lat),
      lng: st?.center_lng == null ? null : Number(st.center_lng),
      lastError: (st?.last_error as string | null) ?? null,
    },
    keywords: (k.data ?? []).map((kw) => {
      const list = byKeyword.get(kw.id) ?? [];
      const toScan = (x: any) =>
        x
          ? {
              runAt: String(x.run_at),
              gridSize: Number(x.grid_size),
              points: (x.points ?? []) as GridPoint[],
              found: Number(x.found),
              average: x.average_rank === null ? null : Number(x.average_rank),
            }
          : null;
      return {
        id: String(kw.id),
        keyword: String(kw.keyword),
        nextRunAt: String(kw.next_run_at),
        latest: toScan(list[0]),
        previous: toScan(list[1]),
      };
    }),
  };
}

export async function saveRankSettings(input: {
  enabled: boolean;
  gridSize: number;
  spacingKm: number;
}) {
  const g = await guard(true, true);
  if (!g.ok) return { ok: false as const, error: g.error };
  if (![3, 5].includes(input.gridSize))
    return { ok: false as const, error: "Choose a 3 by 3 or 5 by 5 grid." };
  const km = Math.round(Number(input.spacingKm) * 10) / 10;
  if (!(km >= 0.5 && km <= 10))
    return { ok: false as const, error: "Spacing must be 0.5 to 10 km." };
  const w = await serviceWrite<unknown>("rank_settings?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      tenant_id: g.tenantId,
      enabled: input.enabled === true,
      grid_size: input.gridSize,
      spacing_km: km,
      updated_by: g.userId,
      updated_at: new Date().toISOString(),
    },
  });
  if (w.error) return { ok: false as const, error: "Could not save the settings." };
  return { ok: true as const };
}

export async function addRankKeyword(input: { keyword: string }) {
  const g = await guard(true, true);
  if (!g.ok) return { ok: false as const, error: g.error };
  const k = cleanKeyword(input.keyword);
  if (!k)
    return {
      ok: false as const,
      error: "Enter a search of 2 to 80 characters, like cleaners newport.",
    };
  const existing = await serviceRead<{ id: string; keyword: string }[]>(
    `rank_keywords?select=id,keyword&tenant_id=eq.${g.tenantId}`,
    "",
  );
  const list = existing.data ?? [];
  if (list.some((x) => x.keyword === k))
    return { ok: false as const, error: "That search is already tracked." };
  if (list.length >= MAX_KEYWORDS)
    return { ok: false as const, error: `Track up to ${MAX_KEYWORDS} searches.` };
  const w = await serviceWrite<unknown>("rank_keywords", "", {
    method: "POST",
    body: { tenant_id: g.tenantId, keyword: k },
  });
  if (w.error) return { ok: false as const, error: "Could not add it." };
  return { ok: true as const };
}

export async function removeRankKeyword(input: { id: string }) {
  const g = await guard(true, true);
  if (!g.ok) return { ok: false as const, error: g.error };
  if (!UUID_RE.test(input.id)) return { ok: false as const, error: "Unknown search." };
  await serviceWrite<unknown>(`rank_keywords?id=eq.${input.id}&tenant_id=eq.${g.tenantId}`, "", {
    method: "DELETE",
  });
  return { ok: true as const };
}

// Check sooner: the next run picks it up (at most once a day per search).
export async function checkRankNow(input: { id: string }) {
  const g = await guard(true, true);
  if (!g.ok) return { ok: false as const, error: g.error };
  if (!UUID_RE.test(input.id)) return { ok: false as const, error: "Unknown search." };
  const last = await serviceRead<{ run_at: string }[]>(
    `rank_scans?select=run_at&keyword_id=eq.${input.id}&tenant_id=eq.${g.tenantId}&order=run_at.desc&limit=1`,
    "",
  );
  const lastAt = Date.parse(last.data?.[0]?.run_at ?? "");
  if (Number.isFinite(lastAt) && Date.now() - lastAt < 86400000)
    return {
      ok: false as const,
      error: "This search was checked in the last day. Try again tomorrow.",
    };
  await serviceWrite<unknown>(`rank_keywords?id=eq.${input.id}&tenant_id=eq.${g.tenantId}`, "", {
    method: "PATCH",
    body: { next_run_at: new Date().toISOString() },
  });
  return { ok: true as const };
}

// ---------- the checks (every 30 minutes, one search per run) ----------

export async function mapsResults(auth: string, keyword: string, lat: number, lng: number) {
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          keyword,
          // Zoom 13: a phone screen shows about 3 miles across, so a business
          // a mile or two away is not cut off just by the screen edge.
          location_coordinate: `${lat},${lng},13z`,
          language_code: "en",
          device: "mobile",
          depth: 20,
        },
      ]),
      signal: AbortSignal.timeout(60000),
    });
    const body = (await r.json().catch(() => null)) as any;
    const task = body?.tasks?.[0];
    if (!r.ok || !task || Number(task.status_code) >= 40000)
      return {
        ok: false as const,
        error: String(task?.status_message ?? body?.status_message ?? r.status),
      };
    return {
      ok: true as const,
      items: task.result?.[0]?.items ?? [],
      cost: Number(task.cost ?? 0),
    };
  } catch {
    return { ok: false as const, error: "DataForSEO could not be reached." };
  }
}

export async function runRankChecks(token: string) {
  if (!hasServiceRole()) return { status: 503, body: { ok: false } };
  const okTok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
    method: "POST",
    body: { p_token: token },
  });
  if (okTok.error || okTok.data !== true) return { status: 401, body: { ok: false } };
  const auth = creds();
  if (!auth) return { status: 200, body: { ok: true, skipped: "not set up" } };

  // Spending cap for this calendar month.
  const monthStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  ).toISOString();
  const spent = await serviceRead<{ cost_usd: number }[]>(
    `rank_scans?select=cost_usd&run_at=gte.${monthStart}`,
    "",
  );
  const total = (spent.data ?? []).reduce((t, x) => t + Number(x.cost_usd ?? 0), 0);
  if (total >= monthlyLimit())
    return { status: 200, body: { ok: true, skipped: "monthly limit reached" } };

  const on = await serviceRead<any[]>(
    `rank_settings?select=tenant_id,grid_size,spacing_km,center_lat,center_lng,place_id&enabled=eq.true`,
    "",
  );
  const settings = new Map((on.data ?? []).map((x) => [String(x.tenant_id), x]));
  if (!settings.size) return { status: 200, body: { ok: true, checked: 0 } };
  const due = await serviceRead<any[]>(
    `rank_keywords?select=id,tenant_id,keyword&active=eq.true&next_run_at=lte.${new Date().toISOString()}` +
      `&tenant_id=in.(${[...settings.keys()].join(",")})&order=next_run_at.asc&limit=1`,
    "",
  );
  const kw = due.data?.[0];
  if (!kw) return { status: 200, body: { ok: true, checked: 0 } };
  const st = settings.get(String(kw.tenant_id))!;
  const setError = (e: string | null) =>
    serviceWrite<unknown>(`rank_settings?tenant_id=eq.${kw.tenant_id}`, "", {
      method: "PATCH",
      body: { last_error: e },
    });

  // Find the business on Google (place ID and position) each run, so a moved
  // or renamed profile is followed.
  const { profileBasics } = await import("./google-business.server");
  const basics = await profileBasics(kw.tenant_id);
  let lat = basics?.lat ?? st.center_lat ?? null;
  let lng = basics?.lng ?? st.center_lng ?? null;
  if (lat === null || lng === null) {
    // Service-area businesses hide their address: use the middle of their clients.
    const sites = await serviceRead<{ lat: number; lng: number }[]>(
      `sites?select=lat,lng&tenant_id=eq.${kw.tenant_id}&lat=not.is.null&limit=500`,
      "",
    );
    const pts = sites.data ?? [];
    if (pts.length) {
      lat = pts.reduce((t, p) => t + Number(p.lat), 0) / pts.length;
      lng = pts.reduce((t, p) => t + Number(p.lng), 0) / pts.length;
    }
  }
  if (!basics || lat === null || lng === null) {
    await setError(
      basics
        ? "Could not tell where the business is. Add its address on Google."
        : "Connect your Google profile first.",
    );
    await serviceWrite<unknown>(`rank_keywords?id=eq.${kw.id}`, "", {
      method: "PATCH",
      body: { next_run_at: new Date(Date.now() + 86400000).toISOString() },
    });
    return { status: 200, body: { ok: true, checked: 0 } };
  }
  await serviceWrite<unknown>(`rank_settings?tenant_id=eq.${kw.tenant_id}`, "", {
    method: "PATCH",
    body: { center_lat: lat, center_lng: lng, place_id: basics.placeId },
  });

  const grid = gridPoints({ lat, lng }, Number(st.grid_size ?? 5), Number(st.spacing_km ?? 1.5));
  const points: GridPoint[] = [];
  let cost = 0;
  let failures = 0;
  let lastErr = "";
  // Five at a time keeps it quick without flooding DataForSEO.
  for (let i = 0; i < grid.length; i += 5) {
    const batch = grid.slice(i, i + 5);
    const res = await Promise.all(batch.map((p) => mapsResults(auth, kw.keyword, p.lat, p.lng)));
    res.forEach((r, j) => {
      const p = batch[j]!;
      if (r.ok) {
        cost += r.cost;
        points.push({ ...p, rank: rankIn(r.items, basics.placeId, basics.title) });
      } else {
        failures++;
        lastErr = r.error;
        points.push({ ...p, rank: null });
      }
    });
  }
  const next = new Date(Date.now() + WEEK).toISOString();
  await serviceWrite<unknown>(`rank_keywords?id=eq.${kw.id}`, "", {
    method: "PATCH",
    body: { next_run_at: next },
  });
  if (failures > grid.length / 2) {
    await setError(`The ranking check did not finish: ${lastErr}`.slice(0, 290));
    return { status: 200, body: { ok: false, failures } };
  }
  const sum = summarisePoints(points);
  await serviceWrite<unknown>("rank_scans", "", {
    method: "POST",
    body: {
      tenant_id: kw.tenant_id,
      keyword_id: kw.id,
      keyword: kw.keyword,
      grid_size: Number(st.grid_size ?? 5),
      spacing_km: Number(st.spacing_km ?? 1.5),
      center_lat: lat,
      center_lng: lng,
      points,
      found: sum.found,
      average_rank: sum.average,
      cost_usd: Math.round(cost * 10000) / 10000,
    },
  });
  await setError(null);
  return { status: 200, body: { ok: true, checked: 1, found: sum.found, cost } };
}
