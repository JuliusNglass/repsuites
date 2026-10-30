// Pure helpers for Facebook Page and Instagram posting. Client-safe.
// No em dashes in this copy (AGENTS.md).

export const GRAPH = "https://graph.facebook.com/v21.0";

// What we ask Meta for when a business connects.
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];

export const IG_CAPTION_MAX = 2200;
export const IG_HASHTAG_MAX = 30;

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const at = text.lastIndexOf(" ", max - 3);
  return `${text.slice(0, at > max * 0.6 ? at : max - 3).trimEnd()}...`;
}

// Instagram: at most 2,200 characters and 30 hashtags. Extra hashtags are
// dropped (the # is removed so the word still reads).
export function igCaption(text: string): string {
  let tags = 0;
  const kept = text.replace(/#([\p{L}\p{N}_]+)/gu, (_m, w: string) => {
    tags++;
    return tags <= IG_HASHTAG_MAX ? `#${w}` : w;
  });
  return cut(kept.trim(), IG_CAPTION_MAX);
}

// Facebook: long posts are allowed; keep it tidy and add the link if any.
export function fbMessage(text: string, link?: string | null): string {
  const body = cut(text.trim(), 5000);
  return link && /^https:\/\//.test(link) && !body.includes(link) ? `${body}\n\n${link}` : body;
}

// Instagram can only use pictures it can read: JPEG works everywhere.
export function igCanUse(imageUrl: string | null | undefined): boolean {
  if (!imageUrl || !/^https:\/\//.test(imageUrl)) return false;
  return !/\.png(\?|$)/i.test(imageUrl);
}

export type ChannelStatus = "posted" | "failed" | "skipped" | null;

// Short words for a post's Facebook or Instagram line.
export function channelText(
  name: "Facebook" | "Instagram",
  status: ChannelStatus,
  error: string | null,
): string {
  if (status === "posted") return `${name}: posted`;
  if (status === "failed") return `${name}: did not post${error ? ` (${error})` : ""}`;
  if (status === "skipped") return `${name}: not posted${error ? ` (${error})` : ""}`;
  return `${name}: waiting`;
}

// Meta errors in plain words.
export function metaError(body: unknown, status: number): string {
  const e = (body as { error?: { message?: string; code?: number } } | null)?.error;
  if (e?.code === 190) return "Facebook needs connecting again.";
  if (e?.code === 10 || e?.code === 200) return "Facebook did not give permission for this.";
  if (status === 429 || e?.code === 4 || e?.code === 32)
    return "Facebook is busy. We will try again.";
  const m = String(e?.message ?? "").slice(0, 160);
  return m ? `Facebook said: ${m}` : "Facebook could not be reached.";
}
