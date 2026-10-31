/* eslint-disable @typescript-eslint/no-explicit-any -- oEmbed and storage JSON is checked field by field. */
// Server-only: the personal video on a prospect's report.
//
// - Video files go straight from the browser to Supabase Storage with a
//   signed upload link (the Worker never carries the bytes).
// - Links (Loom, YouTube, Vimeo) are checked and tidied before saving.
// - The report page reports plays and how far people watch; the first play
//   sends Julius an email so he can call at the right moment.
// No em dashes in this copy (AGENTS.md).
import { getSupabaseConfig } from "./config.server";
import { sendEmail } from "./email.server";
import { getServiceKey, serviceRead, serviceWrite } from "./supabase-service.server";
import { SHARED_ORIGIN } from "./tenant-links.server";
import {
  OG_PATH_RE,
  VIDEO_PATH_RE,
  VIDEO_TYPES,
  parseVideoLink,
  type VideoKind,
} from "./prospect-video";

export const VIDEO_BUCKET = "prospect-videos";
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function storageHeaders(key: string): Record<string, string> {
  return { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
}

function randomName(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function publicUrl(path: string): string {
  return `${getSupabaseConfig().url}/storage/v1/object/public/${VIDEO_BUCKET}/${path}`;
}

// A one-off link the browser can upload one file to.
export async function signedUpload(
  what: "video" | "og",
  ext: string,
): Promise<{ ok: true; path: string; uploadUrl: string } | { ok: false; error: string }> {
  const cfg = getSupabaseConfig();
  const key = getServiceKey();
  if (!cfg.isConfigured || !key) return { ok: false, error: "Storage is not set up." };
  if (what === "video" && !(ext in VIDEO_TYPES))
    return { ok: false, error: "Use an mp4, mov or webm video." };
  const path = what === "video" ? `v/${randomName()}.${ext}` : `og/${randomName()}.jpg`;
  const r = await fetch(`${cfg.url}/storage/v1/object/upload/sign/${VIDEO_BUCKET}/${path}`, {
    method: "POST",
    headers: { ...storageHeaders(key), "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as any;
  const rel = typeof j?.url === "string" ? j.url : "";
  if (!r?.ok || !rel) return { ok: false, error: "Could not start the upload. Try again." };
  return { ok: true, path, uploadUrl: `${cfg.url}/storage/v1${rel}` };
}

async function fileExists(path: string): Promise<boolean> {
  const r = await fetch(publicUrl(path), {
    method: "HEAD",
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  return !!r?.ok;
}

async function removeFile(path: string | null) {
  if (!path || !(VIDEO_PATH_RE.test(path) || OG_PATH_RE.test(path))) return;
  const cfg = getSupabaseConfig();
  const key = getServiceKey();
  if (!cfg.isConfigured || !key) return;
  await fetch(`${cfg.url}/storage/v1/object/${VIDEO_BUCKET}/${path}`, {
    method: "DELETE",
    headers: storageHeaders(key),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
}

function ogPathOf(url: string | null): string | null {
  const base = publicUrl("");
  return url && url.startsWith(base) ? url.slice(base.length) : null;
}

async function current(id: string) {
  const r = await serviceRead<
    { id: string; video_path: string | null; og_image_url: string | null }[]
  >(`prospects?select=id,video_path,og_image_url&id=eq.${id}`, "");
  return r.data?.[0] ?? null;
}

// Saves a video (a link, or a file already uploaded) on the prospect. A new
// video starts the watch figures again.
export async function saveVideo(id: string, input: { link?: string; path?: string }) {
  const row = await current(id);
  if (!row) return { ok: false as const, error: "Prospect not found." };
  let kind: VideoKind;
  let url: string;
  let path: string | null = null;
  if (input.path) {
    if (!VIDEO_PATH_RE.test(input.path)) return { ok: false as const, error: "Upload failed." };
    if (!(await fileExists(input.path)))
      return { ok: false as const, error: "The upload did not finish. Try again." };
    kind = "file";
    path = input.path;
    url = publicUrl(path);
  } else {
    const v = parseVideoLink(input.link ?? "");
    if (!v)
      return {
        ok: false as const,
        error: "Paste a Loom, YouTube or Vimeo link, or upload a video file.",
      };
    kind = v.kind;
    url = v.url;
  }
  const w = await serviceWrite<unknown>(`prospects?id=eq.${id}`, "", {
    method: "PATCH",
    body: {
      video_url: url,
      video_kind: kind,
      video_path: path,
      video_added_at: new Date().toISOString(),
      video_first_played_at: null,
      video_last_played_at: null,
      video_plays: 0,
      video_max_percent: 0,
      og_image_url: null,
      updated_at: new Date().toISOString(),
    },
  });
  if (w.error) return { ok: false as const, error: "Could not save the video." };
  if (row.video_path && row.video_path !== path) await removeFile(row.video_path);
  await removeFile(ogPathOf(row.og_image_url));
  return { ok: true as const, kind, url };
}

export async function removeVideo(id: string) {
  const row = await current(id);
  if (!row) return { ok: false as const, error: "Prospect not found." };
  const w = await serviceWrite<unknown>(`prospects?id=eq.${id}`, "", {
    method: "PATCH",
    body: {
      video_url: null,
      video_kind: null,
      video_path: null,
      video_added_at: null,
      og_image_url: null,
      updated_at: new Date().toISOString(),
    },
  });
  if (w.error) return { ok: false as const, error: "Could not remove the video." };
  await removeFile(row.video_path);
  await removeFile(ogPathOf(row.og_image_url));
  return { ok: true as const };
}

// The link-preview picture made in the browser and uploaded to og/<random>.jpg
export async function setOgImage(id: string, path: string) {
  if (!OG_PATH_RE.test(path) || !(await fileExists(path)))
    return { ok: false as const, error: "The picture did not upload." };
  const row = await current(id);
  if (!row) return { ok: false as const, error: "Prospect not found." };
  const w = await serviceWrite<unknown>(`prospects?id=eq.${id}`, "", {
    method: "PATCH",
    body: { og_image_url: publicUrl(path) },
  });
  if (w.error) return { ok: false as const, error: "Could not save the picture." };
  await removeFile(ogPathOf(row.og_image_url));
  return { ok: true as const };
}

// A still picture of a Loom, YouTube or Vimeo video as a data: URL, so the
// browser can draw it on a canvas. Null if there is none.
export async function linkThumbnail(link: string): Promise<string | null> {
  const v = parseVideoLink(link);
  if (!v) return null;
  let thumb = "";
  if (v.kind === "youtube") thumb = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
  else {
    const o =
      v.kind === "loom"
        ? `https://www.loom.com/v1/oembed?url=${encodeURIComponent(v.url)}`
        : `https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(v.url)}`;
    const r = await fetch(o, { signal: AbortSignal.timeout(10000) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as any;
    thumb = typeof j?.thumbnail_url === "string" ? j.thumbnail_url : "";
  }
  if (!/^https:\/\//.test(thumb)) return null;
  const img = await fetch(thumb, { signal: AbortSignal.timeout(10000) }).catch(() => null);
  const type = img?.headers.get("content-type") ?? "";
  if (!img?.ok || !/^image\/(jpeg|png|webp|gif)/.test(type)) return null;
  const bytes = new Uint8Array(await img.arrayBuffer());
  if (bytes.length > 2_000_000) return null;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type.split(";")[0]};base64,${btoa(bin)}`;
}

// The report page tells us when the video plays and how far they got
// (25, 50, 75 or 100 percent). The first play emails Julius. Nothing counts
// until the message was sent (before that it is only our own testing).
export async function trackVideo(token: string, event: "play" | "progress", percent: number) {
  if (!TOKEN_RE.test(token)) return;
  const r = await serviceRead<
    {
      id: string;
      name: string;
      contact_name: string | null;
      phone: string | null;
      video_url: string | null;
      video_first_played_at: string | null;
      video_plays: number;
      video_max_percent: number;
      sent_at: string | null;
    }[]
  >(
    `prospects?select=id,name,contact_name,phone,video_url,video_first_played_at,video_plays,video_max_percent,sent_at&report_token=eq.${token}`,
    "",
  );
  const p = r.data?.[0];
  if (!p?.video_url || !p.sent_at) return;
  const now = new Date().toISOString();
  const pct = Math.max(0, Math.min(100, Math.round(percent / 25) * 25));
  const body: Record<string, unknown> = { video_last_played_at: now };
  if (event === "play") body["video_plays"] = (p.video_plays ?? 0) + 1;
  if (pct > (p.video_max_percent ?? 0)) body["video_max_percent"] = pct;
  await serviceWrite(`prospects?id=eq.${p.id}`, "", { method: "PATCH", body }).catch(() => null);
  if (p.video_first_played_at) return;
  // Only the request that sets the first play sends the email.
  const first = await serviceWrite<{ id: string }[]>(
    `prospects?id=eq.${p.id}&video_first_played_at=is.null`,
    "",
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { video_first_played_at: now },
    },
  ).catch(() => null);
  if (!first?.data?.length) return;
  const to = (process.env["REPSUITES_LEADS_TO"] ?? "").trim() || "julius@accelur8.com";
  await sendEmail({
    to,
    subject: `${p.name} is watching your video now`,
    html: `<p><b>${esc(p.name)}</b> is watching your video now. Good moment to call.</p>
<p>${p.contact_name ? `${esc(p.contact_name)}<br>` : ""}${p.phone ? `Phone: <a href="tel:${esc(p.phone.replace(/[^\d+]/g, ""))}">${esc(p.phone)}</a>` : "No phone number saved."}</p>
<p><a href="${SHARED_ORIGIN}/r/${token}">Open their report</a> &middot; <a href="${SHARED_ORIGIN}/prospects">Prospects</a></p>`,
  }).catch(() => null);
}

// The prospect tapped "Message me on WhatsApp" or "Book a call" on their
// report: move them to Replied (unless further along) and tell Julius once.
// Only after the message was sent.
export async function trackAction(token: string, action: "chat" | "call") {
  if (!TOKEN_RE.test(token)) return;
  const moved = await serviceWrite<{ id: string; name: string; phone: string | null }[]>(
    `prospects?report_token=eq.${token}&stage=in.(new,sent,opened)&sent_at=not.is.null`,
    "",
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: {
        stage: "replied",
        follow_up_on: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      },
    },
  ).catch(() => null);
  const p = moved?.data?.[0];
  if (!p) return;
  const to = (process.env["REPSUITES_LEADS_TO"] ?? "").trim() || "julius@accelur8.com";
  const what =
    action === "chat" ? "tapped Message me on WhatsApp" : "tapped Book a free 15-minute call";
  await sendEmail({
    to,
    subject: `${p.name} ${what}`,
    html: `<p><b>${esc(p.name)}</b> ${what} on their report. Check WhatsApp${action === "call" ? " and your bookings" : ""}, and reply quickly.</p>
<p>${p.phone ? `Phone: <a href="tel:${esc(p.phone.replace(/[^\d+]/g, ""))}">${esc(p.phone)}</a>` : ""}</p>
<p><a href="${SHARED_ORIGIN}/r/${token}">Open their report</a> &middot; <a href="${SHARED_ORIGIN}/prospects">Prospects</a></p>`,
  }).catch(() => null);
}
