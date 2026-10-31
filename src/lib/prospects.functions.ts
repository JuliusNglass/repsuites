// Lead generator server functions (Accelur8 team only).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { addressCountry, phoneType, type PhoneType } from "./prospect-contact";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import {
  agencyGuard,
  saveProspectReport,
  addProspectGrid,
  searchBusinesses,
  STAGES,
  type Report,
} from "./prospects.server";

const PLACE_RE = /^[A-Za-z0-9_-]{10,300}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const searchProspects = createServerFn({ method: "POST" })
  .validator((d: { q: string; page?: string }) =>
    z
      .object({
        q: z.string().trim().min(3).max(120),
        page: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    const found = await searchBusinesses(data.q, data.page ?? "");
    if (!found)
      return { ok: false as const, error: "Google search is not available. Check the Maps key." };
    const hits = found.hits;
    const ids = hits.map((h) => `"${h.placeId}"`).join(",");
    const { cachedContacts } = await import("./prospect-contact.server");
    const { contactsFresh } = await import("./prospect-contact");
    const [known, cache] = await Promise.all([
      hits.length
        ? serviceRead<
            {
              place_id: string;
              email: string | null;
              facebook_url: string | null;
              instagram_url: string | null;
            }[]
          >(`prospects?select=place_id,email,facebook_url,instagram_url&place_id=in.(${ids})`, "")
        : Promise.resolve({ data: [] as never[] }),
      cachedContacts(hits.map((h) => h.placeId)),
    ]);
    const saved = new Map((known.data ?? []).map((k) => [k.place_id, k]));
    return {
      ok: true as const,
      next: found.next,
      hits: hits.map((h) => {
        const s = saved.get(h.placeId);
        const c = cache.get(h.placeId);
        return {
          ...h,
          saved: !!s,
          savedEmail: !!s?.email,
          // An email on a saved prospect (maybe typed by hand) wins.
          email: s?.email || c?.email || "",
          facebook: s?.facebook_url || c?.facebook || "",
          instagram: s?.instagram_url || c?.instagram || "",
          // No website means nothing to look at; a fresh cache means no need.
          checked: !h.website || contactsFresh(c?.foundAt),
        };
      }),
    };
  });

// The email finder: reads the websites of up to 8 search results for an
// email and Facebook/Instagram links. Called from the page in batches so each
// request stays inside the 50 outside calls the Worker may make.
export const findProspectContacts = createServerFn({ method: "POST" })
  .validator(
    (d: { items: { placeId: string; website: string; saved?: boolean; hasEmail?: boolean }[] }) =>
      z
        .object({
          items: z
            .array(
              z.object({
                placeId: z.string().regex(PLACE_RE),
                website: z.string().trim().url().max(300),
                saved: z.boolean().optional(),
                hasEmail: z.boolean().optional(),
              }),
            )
            .min(1)
            .max(8),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    const { findContacts } = await import("./prospect-contact.server");
    const found = await findContacts(data.items);
    return {
      ok: true as const,
      found: found.map((f) => ({
        placeId: f.placeId,
        email: f.email,
        facebook: f.facebook,
        instagram: f.instagram,
      })),
    };
  });

function phrases(raw?: string): { keyword?: string; keywords?: string[] } {
  const list = (raw ?? "")
    .split(",")
    .map((k) => k.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 3);
  return list.length ? { keyword: list[0]!, keywords: list.slice(1) } : {};
}

export const buildProspectReport = createServerFn({ method: "POST" })
  .validator((d: { placeId: string; keyword?: string; niche?: boolean; area?: string }) =>
    z
      .object({
        placeId: z.string().regex(PLACE_RE),
        // Up to 3 search phrases, separated by commas. The first is the main one.
        keyword: z.string().trim().max(250).optional(),
        niche: z.boolean().optional(),
        area: z.enum(["small", "medium", "large"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    return saveProspectReport(data.placeId, data.niche ? "niche" : "search", {
      createdBy: g.userId,
      ...phrases(data.keyword),
      ...(data.area ? { area: data.area } : {}),
    });
  });

export const addProspectPhrase = createServerFn({ method: "POST" })
  .validator((d: { placeId: string; keyword: string }) =>
    z
      .object({ placeId: z.string().regex(PLACE_RE), keyword: z.string().trim().min(2).max(80) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    return addProspectGrid(data.placeId, data.keyword);
  });

export const listProspects = createServerFn({ method: "GET" }).handler(async () => {
  const g = await agencyGuard(false);
  if (!g.ok) return g;
  const r = await serviceRead<
    {
      id: string;
      name: string;
      town: string | null;
      phone: string | null;
      email: string | null;
      contact_name: string | null;
      stage: string;
      follow_up_on: string | null;
      notes: string | null;
      report: Report | null;
      report_token: string | null;
      opens: number;
      last_opened_at: string | null;
      gbp_connected_at: string | null;
      source: string;
      created_at: string;
      video_url: string | null;
      video_kind: string | null;
      video_first_played_at: string | null;
      video_max_percent: number;
      og_image_url: string | null;
      phone_type: string | null;
      address: string | null;
      facebook_url: string | null;
      instagram_url: string | null;
    }[]
  >(
    "prospects?select=id,name,town,phone,email,contact_name,stage,follow_up_on,notes,report,report_token,opens,last_opened_at,gbp_connected_at,source,created_at,video_url,video_kind,video_first_played_at,video_max_percent,og_image_url,phone_type,address,facebook_url,instagram_url&order=updated_at.desc&limit=300",
    "",
  );
  return {
    ok: true as const,
    prospects: (r.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      town: p.town ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      contactName: p.contact_name ?? "",
      stage: p.stage,
      followUpOn: p.follow_up_on,
      notes: p.notes ?? "",
      score: p.report?.score ?? null,
      topFix: p.report?.fixes?.[0]?.title ?? null,
      link: p.report_token ? `https://repsuites.com/r/${p.report_token}` : null,
      opens: p.opens,
      lastOpenedAt: p.last_opened_at,
      googleConnected: !!p.gbp_connected_at,
      source: p.source,
      createdAt: p.created_at,
      videoUrl: p.video_url,
      videoKind: p.video_kind,
      videoFirstPlayedAt: p.video_first_played_at,
      videoMaxPercent: p.video_max_percent ?? 0,
      ogImage: p.og_image_url,
      // Older prospects were saved before we stored this; work it out.
      phoneType:
        (p.phone_type as PhoneType | null) ?? phoneType(p.phone, addressCountry(p.address ?? "")),
      facebook: p.facebook_url ?? "",
      instagram: p.instagram_url ?? "",
    })),
  };
});

export const updateProspect = createServerFn({ method: "POST" })
  .validator(
    (d: {
      id: string;
      stage?: string;
      followUpOn?: string | null;
      notes?: string;
      email?: string;
      contactName?: string;
    }) =>
      z
        .object({
          id: z.string().regex(UUID_RE),
          stage: z.enum(STAGES).optional(),
          followUpOn: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable()
            .optional(),
          notes: z.string().max(4000).optional(),
          email: z.union([z.literal(""), z.string().trim().email().max(320)]).optional(),
          contactName: z.string().trim().max(120).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.stage) body["stage"] = data.stage;
    if (data.followUpOn !== undefined) body["follow_up_on"] = data.followUpOn;
    if (data.notes !== undefined) body["notes"] = data.notes || null;
    if (data.email !== undefined) body["email"] = data.email || null;
    if (data.contactName !== undefined) body["contact_name"] = data.contactName || null;
    const w = await serviceWrite<unknown>(`prospects?id=eq.${data.id}`, "", {
      method: "PATCH",
      body,
    });
    return w.error ? { ok: false as const, error: "Could not save." } : { ok: true as const };
  });

// ---------- the personal video on the report ----------

export const startProspectUpload = createServerFn({ method: "POST" })
  .validator((d: { what: "video" | "og"; ext: string }) =>
    z
      .object({ what: z.enum(["video", "og"]), ext: z.enum(["mp4", "mov", "webm", "jpg"]) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    const { signedUpload } = await import("./prospect-video.server");
    return signedUpload(data.what, data.ext);
  });

export const saveProspectVideo = createServerFn({ method: "POST" })
  .validator((d: { id: string; link?: string; path?: string }) =>
    z
      .object({
        id: z.string().regex(UUID_RE),
        link: z.string().trim().max(500).optional(),
        path: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    const { saveVideo } = await import("./prospect-video.server");
    return saveVideo(data.id, {
      ...(data.link ? { link: data.link } : {}),
      ...(data.path ? { path: data.path } : {}),
    });
  });

export const removeProspectVideo = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => z.object({ id: z.string().regex(UUID_RE) }).parse(d))
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    const { removeVideo } = await import("./prospect-video.server");
    return removeVideo(data.id);
  });

export const prospectVideoThumb = createServerFn({ method: "POST" })
  .validator((d: { link: string }) => z.object({ link: z.string().max(500) }).parse(d))
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    const { linkThumbnail } = await import("./prospect-video.server");
    return { ok: true as const, thumb: await linkThumbnail(data.link) };
  });

export const setProspectOgImage = createServerFn({ method: "POST" })
  .validator((d: { id: string; path: string }) =>
    z.object({ id: z.string().regex(UUID_RE), path: z.string().max(120) }).parse(d),
  )
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    const { setOgImage } = await import("./prospect-video.server");
    return setOgImage(data.id, data.path);
  });
