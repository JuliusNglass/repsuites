// Pure helpers for the personal video on a prospect's report. Client-safe.
// No em dashes in copy (AGENTS.md).

export type VideoKind = "loom" | "youtube" | "vimeo" | "file";

export interface ParsedVideo {
  kind: Exclude<VideoKind, "file">;
  id: string;
  // Vimeo unlisted videos need their private hash.
  hash?: string;
  // The tidy share link we keep.
  url: string;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const LOOM_ID = /^[A-Za-z0-9]{16,64}$/;

// Reads a pasted Loom, YouTube or Vimeo link. Returns null if it is none of them.
export function parseVideoLink(raw: string): ParsedVideo | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "loom.com" || host.endsWith(".loom.com")) {
    // loom.com/share/<id> or loom.com/embed/<id>
    const i = parts.findIndex((p) => p === "share" || p === "embed");
    const id = i >= 0 ? parts[i + 1] : undefined;
    if (!id || !LOOM_ID.test(id)) return null;
    return { kind: "loom", id, url: `https://www.loom.com/share/${id}` };
  }

  if (host === "youtu.be") {
    const id = parts[0];
    return id && YT_ID.test(id) ? { kind: "youtube", id, url: `https://youtu.be/${id}` } : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    let id = u.searchParams.get("v") ?? "";
    if (!id && ["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? "";
    return YT_ID.test(id) ? { kind: "youtube", id, url: `https://youtu.be/${id}` } : null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    // vimeo.com/<id>, vimeo.com/<id>/<hash>, player.vimeo.com/video/<id>?h=<hash>
    const nums = parts.filter((p) => /^\d{5,12}$/.test(p));
    const id = nums[0];
    if (!id) return null;
    const after = parts[parts.indexOf(id) + 1];
    const hash = u.searchParams.get("h") ?? (after && /^[a-f0-9]{6,20}$/i.test(after) ? after : "");
    const clean = hash && /^[a-f0-9]{6,20}$/i.test(hash) ? hash : "";
    return {
      kind: "vimeo",
      id,
      ...(clean ? { hash: clean } : {}),
      url: `https://vimeo.com/${id}${clean ? `/${clean}` : ""}`,
    };
  }
  return null;
}

// The address to put in an <iframe>, or null for uploaded files (they use
// a plain <video> tag).
export function embedUrl(kind: VideoKind, url: string): string | null {
  if (kind === "file") return null;
  const v = parseVideoLink(url);
  if (!v || v.kind !== kind) return null;
  if (v.kind === "loom")
    return `https://www.loom.com/embed/${v.id}?hide_owner=true&hide_share=true`;
  if (v.kind === "youtube")
    return `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&playsinline=1&enablejsapi=1`;
  return `https://player.vimeo.com/video/${v.id}?${v.hash ? `h=${v.hash}&` : ""}playsinline=1&dnt=1`;
}

// Uploaded files: mp4, mov or webm, up to 200 MB.
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const VIDEO_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function videoExt(fileName: string, mime: string): string | null {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (ext in VIDEO_TYPES) return ext;
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  return null;
}

// Files we keep in the prospect-videos bucket: v/<random>.<ext> or og/<random>.jpg
export const VIDEO_PATH_RE = /^v\/[A-Za-z0-9_-]{24,64}\.(mp4|mov|webm)$/;
export const OG_PATH_RE = /^og\/[A-Za-z0-9_-]{24,64}\.jpg$/;

// "Watched 75%", "Played the video" or "" for the Prospects list.
export function watchLabel(firstPlayedAt: string | null, maxPercent: number): string {
  if (!firstPlayedAt) return "";
  if (maxPercent >= 100) return "Watched it all";
  if (maxPercent >= 25) return `Watched ${maxPercent}%`;
  return "Played the video";
}

// The short personal message to send with the link when there is a video.
// Worked example: "Hi Sam, I recorded a quick 90-second video about Sam's
// Cafe on Google. ... Watch here: https://repsuites.com/r/abc"
export function videoMessage(
  p: { name: string; contactName?: string; topFix?: string | null },
  link: string,
  forEmail = false,
): string {
  const hi = p.contactName ? `Hi ${p.contactName.split(" ")[0]}` : "Hi";
  const finding = p.topFix ? ` ${p.topFix.replace(/\.$/, "")}.` : "";
  const body = `${hi}, I recorded a quick 90-second video about ${p.name} on Google.${finding} Watch here: ${link}`;
  return forEmail ? `${body}\n\nReply STOP and I won't message again.` : body;
}
