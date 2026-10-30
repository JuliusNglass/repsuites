/* eslint-disable @typescript-eslint/no-explicit-any -- Google and Anthropic JSON is checked field by field. */
// Server-only: "Plan my month". Claude writes 4 Google posts from the
// business's real reviews and Customer Insights, saved as drafts for the
// next 4 Tuesdays. Nothing is published until the owner approves; then the
// 30-minute job posts each one on its day. Part of RepSuites Growth.
// No em dashes in this copy (AGENTS.md).
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { accessToken, connectionFor, google } from "./google-business.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { featureBlockedFor } from "./tenant-access.server";
import { getSupabaseConfig } from "./config.server";
import { getServiceKey } from "./supabase-service.server";
import {
  choosePhotos,
  parsePlan,
  pickQuote,
  planDates,
  POST_BUTTONS,
  seasonNotes,
  tidyPost,
  type GooglePhoto,
  type ReviewQuote,
} from "./post-plan";

const EDITORS = ["owner", "admin", "super_admin", "manager"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEEK = 7 * 86400000;

async function guard() {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: g.error || "Sign in again." };
  if (!EDITORS.includes(g.session.role || ""))
    return { ok: false as const, error: "Access denied." };
  if (!(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Please refresh the page and try again." };
  const tenantId = g.session.active_tenant_id!;
  const paid = await featureBlockedFor(g.session.access_token, tenantId, "growth");
  if (paid) return { ok: false as const, error: paid };
  return { ok: true as const, tenantId, userId: g.session.user_id };
}

const SYSTEM =
  "You write Google Business Profile posts for a small local business in the UK. " +
  "Write in plain, friendly British English that anyone can read easily (short sentences, everyday words). " +
  "Never use em dashes or en dashes. At most one emoji per post, often none. " +
  "Only use facts given to you: never invent offers, prices, discounts, opening times, awards or events the business has not mentioned. " +
  "You may quote a few words from a real review with the customer's first name only. " +
  "Never include phone numbers or web addresses in the text. Each post is 300 to 600 characters and ends with a gentle call to action. " +
  "Make the 4 posts different: for example one about what customers love, one about the team, one tied to the time of year, one about what the business does best. " +
  "Answer by filling in the google_posts_plan form with exactly 4 posts. If you cannot use the form, reply with only JSON like " +
  '{"posts":[{"text":"...","button":"LEARN_MORE"}]}. button is one of LEARN_MORE, CALL, BOOK, ORDER, or null.';

async function businessDetails(tenantId: string) {
  const conn = await connectionFor(tenantId);
  const token = conn ? await accessToken(tenantId) : null;
  let website = "";
  let category = "";
  if (conn && token) {
    const loc = conn.path.split("/").slice(2).join("/");
    const r = await google(
      token,
      `https://mybusinessbusinessinformation.googleapis.com/v1/${loc}?readMask=websiteUri,categories`,
    );
    if (r.ok) {
      website = String(r.data?.websiteUri ?? "");
      category = String(r.data?.categories?.primaryCategory?.displayName ?? "");
    }
  }
  return {
    conn,
    token,
    website: /^https:\/\//.test(website) ? website.slice(0, 490) : "",
    category,
  };
}

async function askClaude(prompt: string): Promise<{ text: string } | { error: string }> {
  const key = (process.env["REPSUITES_ANTHROPIC_API_KEY"] ?? "").trim();
  if (!key) return { error: "AI writing is not switched on yet. Please contact RepSuites." };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model: (process.env["REPSUITES_POSTS_MODEL"] ?? "").trim() || "claude-sonnet-5-5",
        max_tokens: 2500,
        system: SYSTEM,
        tools: [
          {
            name: "google_posts_plan",
            description: "Record the 4 Google posts for the next 4 weeks.",
            input_schema: {
              type: "object",
              properties: {
                posts: {
                  type: "array",
                  minItems: 4,
                  maxItems: 4,
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string" },
                      button: { type: ["string", "null"], enum: [...POST_BUTTONS, null] },
                    },
                    required: ["text", "button"],
                  },
                },
              },
              required: ["posts"],
            },
          },
        ],
        // This model refuses a forced tool; "auto" plus the instruction works.
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      const why = String(b?.error?.message ?? "").slice(0, 160);
      return { error: `The posts could not be written (${res.status}${why ? `: ${why}` : ""}).` };
    }
    const body = (await res.json()) as { content?: any[] };
    const used = (body.content ?? []).find((c) => c?.type === "tool_use");
    return {
      text: used
        ? JSON.stringify(used.input ?? {})
        : (body.content ?? [])
            .filter((c) => c?.type === "text")
            .map((c) => String(c.text ?? ""))
            .join(""),
    };
  } catch {
    return { error: "The posts could not be written. Try again shortly." };
  }
}

// When the last plan was made, so we allow one a week.
async function lastPlanAt(tenantId: string): Promise<number | null> {
  const r = await serviceRead<{ created_at: string }[]>(
    `google_posts?select=created_at&tenant_id=eq.${tenantId}&source=eq.ai&order=created_at.desc&limit=1`,
    "",
  );
  const at = r.data?.[0]?.created_at;
  return at ? Date.parse(at) : null;
}

export async function planGooglePosts() {
  const g = await guard();
  if (!g.ok) return g;
  const last = await lastPlanAt(g.tenantId);
  if (last && Date.now() - last < WEEK) {
    const when = new Date(last + WEEK).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return {
      ok: false as const,
      error: `You planned posts this week already. You can plan more on ${when}.`,
    };
  }
  const { conn, token, website, category } = await businessDetails(g.tenantId);
  if (!conn) return { ok: false as const, error: "Connect your Google profile first." };

  const [ins, reviews] = await Promise.all([
    serviceRead<{ summary: any }[]>(
      `customer_insights?select=summary&tenant_id=eq.${g.tenantId}&summary=not.is.null&order=created_at.desc&limit=1`,
      "",
    ),
    serviceRead<{ reviewer: string | null; stars: number | null; comment: string | null }[]>(
      `google_reviews?select=reviewer,stars,comment&tenant_id=eq.${g.tenantId}&stars=gte.4&comment=not.is.null&order=created_at_google.desc.nullslast&limit=15`,
      "",
    ),
  ]);
  const s = ins.data?.[0]?.summary ?? null;
  const quotes = (reviews.data ?? [])
    .filter((r) => (r.comment ?? "").trim().length > 15)
    .slice(0, 10)
    .map((r) => {
      const first = String(r.reviewer ?? "").split(/\s+/)[0] || "A customer";
      return `- ${first} (${r.stars} stars): "${String(r.comment).slice(0, 300).replace(/\s+/g, " ")}"`;
    });
  if (!s && quotes.length < 2)
    return {
      ok: false as const,
      error: "We need a few written reviews first, so the posts can use real words from customers.",
    };
  const now = new Date();
  const dates = planDates(now);
  const prompt = [
    `Business: ${conn.title}${category ? ` (${category})` : ""}`,
    `Website for the button: ${website ? "yes" : "none, so use CALL or null"}`,
    `Posts go out on: ${dates.map((d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" })).join(", ")}`,
    `Coming up: ${seasonNotes(now).join("; ") || "nothing special"}`,
    s
      ? `What customers say (summary): ${s.headline ?? ""}\nThey love: ${(s.praises ?? []).map((p: any) => `${p.theme} ("${p.quote}")`).join("; ")}\nStaff customers name: ${
          (s.people ?? [])
            .filter((p: any) => p.tone !== "negative")
            .map((p: any) => p.name)
            .join(", ") || "none"
        }`
      : "",
    quotes.length ? `Recent good reviews:\n${quotes.join("\n")}` : "",
    "Write the 4 posts, one for each date, in date order.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await askClaude(prompt);
  if ("error" in out) return { ok: false as const, error: out.error };
  const posts = parsePlan(out.text);
  if (posts.length < 2)
    return { ok: false as const, error: "The posts came back in the wrong shape. Try again." };

  // A picture for each post: the business's own Google photos first, then a
  // branded review card (drawn on the owner's screen when they open the drafts).
  const photos = conn && token ? await googlePhotos(token, conn.path) : [];
  const reviewList = toQuotes(reviews.data ?? []);
  const usedQuotes = new Set<string>();
  const rows = posts.map((p, i) => {
    const button = p.button && p.button !== "CALL" && !website ? "CALL" : p.button;
    const photo = photos[i];
    const card = photo ? null : pickQuote(p.text, reviewList, usedQuotes);
    if (card) {
      const r = reviewList.find(
        (x) => x.first === card.by && x.comment.includes(card.quote.replace(/\.\.\.$/, "")),
      );
      if (r) usedQuotes.add(r.comment);
    }
    return {
      image_url: photo?.url ?? null,
      image_kind: photo ? "google" : card ? "card" : null,
      image_quote: card?.quote ?? null,
      image_by: photo ? (photo.byCustomer ? "customer" : null) : card?.by || null,
      tenant_id: g.tenantId,
      summary: p.text,
      action_type: button,
      action_url: button && button !== "CALL" ? website : null,
      publish_at: dates[i]!,
      status: "draft",
      source: "ai",
      created_by: g.userId,
    };
  });
  const w = await serviceWrite("google_posts", "", { method: "POST", body: rows });
  if (w.error) return { ok: false as const, error: "Could not save the posts. Try again." };
  return { ok: true as const, count: rows.length };
}

// One tap: every draft becomes scheduled. A draft whose day has passed goes
// out in the next run instead.
export async function approveGooglePosts() {
  const g = await guard();
  if (!g.ok) return g;
  const d = await serviceRead<{ id: string; publish_at: string }[]>(
    `google_posts?select=id,publish_at&tenant_id=eq.${g.tenantId}&status=eq.draft`,
    "",
  );
  const soon = new Date(Date.now() + 5 * 60000).toISOString();
  for (const p of d.data ?? []) {
    await serviceWrite(`google_posts?id=eq.${p.id}&tenant_id=eq.${g.tenantId}`, "", {
      method: "PATCH",
      body: {
        status: "scheduled",
        ...(Date.parse(p.publish_at) < Date.now() ? { publish_at: soon } : {}),
      },
    });
  }
  return { ok: true as const, count: d.data?.length ?? 0 };
}

export async function editGooglePost(input: { id: string; summary: string }) {
  const g = await guard();
  if (!g.ok) return g;
  if (!UUID_RE.test(input.id)) return { ok: false as const, error: "Unknown post." };
  const text = tidyPost(input.summary);
  if (text.length < 10 || text.length > 1500)
    return { ok: false as const, error: "Write a post of 10 to 1,500 characters." };
  const w = await serviceWrite(
    `google_posts?id=eq.${input.id}&tenant_id=eq.${g.tenantId}&status=in.(draft,scheduled)`,
    "",
    { method: "PATCH", body: { summary: text } },
  );
  return w.error ? { ok: false as const, error: "Could not save." } : { ok: true as const, text };
}

// ---------- pictures ----------

function toQuotes(rows: { reviewer: string | null; comment: string | null }[]): ReviewQuote[] {
  return rows
    .filter((r) => (r.comment ?? "").trim().length > 15)
    .map((r) => ({
      first: String(r.reviewer ?? "").split(/\s+/)[0] || "",
      comment: String(r.comment),
    }));
}

// Photos on the Google profile: the business's own first, then photos
// customers added (labelled, so the owner can choose). One call each.
async function googlePhotos(token: string, path: string): Promise<GooglePhoto[]> {
  const [own, customers] = await Promise.all([
    google(token, `https://mybusiness.googleapis.com/v4/${path}/media?pageSize=100`),
    google(token, `https://mybusiness.googleapis.com/v4/${path}/media/customers?pageSize=100`),
  ]);
  for (const [name, r] of [
    ["own", own],
    ["customers", customers],
  ] as const)
    console.log(
      "[post-plan] google media",
      name,
      r.status,
      r.ok ? (r.data?.mediaItems?.length ?? 0) : String(r.data?.error?.message ?? "").slice(0, 300),
    );
  const mine = own.ok ? choosePhotos(own.data?.mediaItems) : [];
  const theirs = customers.ok
    ? choosePhotos(customers.data?.mediaItems).map((p) => ({ ...p, byCustomer: true }))
    : [];
  return [...mine, ...theirs];
}

async function postFor(tenantId: string, id: string) {
  if (!UUID_RE.test(id)) return null;
  const r = await serviceRead<
    { id: string; summary: string; image_url: string | null; image_kind: string | null }[]
  >(
    `google_posts?select=id,summary,image_url,image_kind&id=eq.${id}&tenant_id=eq.${tenantId}&status=in.(draft,scheduled)`,
    "",
  );
  return r.data?.[0] ?? null;
}

async function setPicture(tenantId: string, id: string, body: Record<string, unknown>) {
  const w = await serviceWrite(`google_posts?id=eq.${id}&tenant_id=eq.${tenantId}`, "", {
    method: "PATCH",
    body,
  });
  return w.error
    ? { ok: false as const, error: "Could not save the picture." }
    : { ok: true as const };
}

// "Change picture": the next Google photo not used by another waiting post;
// after the last photo, a review card; after the card, back to the first photo.
export async function changePostPicture(input: { id: string }) {
  const g = await guard();
  if (!g.ok) return g;
  const post = await postFor(g.tenantId, input.id);
  if (!post) return { ok: false as const, error: "Unknown post." };
  const conn = await connectionFor(g.tenantId);
  const token = conn ? await accessToken(g.tenantId) : null;
  const photos = conn && token ? await googlePhotos(token, conn.path) : [];
  const others = await serviceRead<{ image_url: string | null }[]>(
    `google_posts?select=image_url&tenant_id=eq.${g.tenantId}&status=in.(draft,scheduled)&id=neq.${post.id}`,
    "",
  );
  const taken = new Set((others.data ?? []).map((o) => o.image_url).filter(Boolean));
  const at = post.image_kind === "google" ? photos.findIndex((p) => p.url === post.image_url) : -1;
  const startFrom = post.image_kind === "card" ? 0 : at + 1;
  const next = photos.slice(startFrom).find((p) => !taken.has(p.url));
  if (next && !(post.image_kind === "card" && !photos.length))
    return setPicture(g.tenantId, post.id, {
      image_url: next.url,
      image_kind: "google",
      image_quote: null,
      image_by: next.byCustomer ? "customer" : null,
    });
  // No more photos: a review card.
  const reviews = await serviceRead<{ reviewer: string | null; comment: string | null }[]>(
    `google_reviews?select=reviewer,comment&tenant_id=eq.${g.tenantId}&stars=gte.4&comment=not.is.null&order=created_at_google.desc.nullslast&limit=15`,
    "",
  );
  const card = pickQuote(post.summary, toQuotes(reviews.data ?? []));
  if (!card) return { ok: false as const, error: "There are no more pictures to choose from." };
  return setPicture(g.tenantId, post.id, {
    image_url: null,
    image_kind: "card",
    image_quote: card.quote,
    image_by: card.by || null,
  });
}

export async function removePostPicture(input: { id: string }) {
  const g = await guard();
  if (!g.ok) return g;
  const post = await postFor(g.tenantId, input.id);
  if (!post) return { ok: false as const, error: "Unknown post." };
  return setPicture(g.tenantId, post.id, {
    image_url: null,
    image_kind: null,
    image_quote: null,
    image_by: null,
  });
}

// The review card drawn on the owner's screen, saved where Google can fetch it.
export async function saveCardPicture(input: { id: string; png: string }) {
  const g = await guard();
  if (!g.ok) return g;
  const post = await postFor(g.tenantId, input.id);
  if (!post || post.image_kind !== "card") return { ok: false as const, error: "Unknown post." };
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(input.png);
  if (!m) return { ok: false as const, error: "That picture could not be read." };
  const bytes = Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0));
  if (bytes.length < 1000 || bytes.length > 4_000_000)
    return { ok: false as const, error: "That picture is the wrong size." };
  const cfg = getSupabaseConfig();
  const key = getServiceKey();
  if (!cfg.isConfigured || !key) return { ok: false as const, error: "Storage is not set up." };
  const path = `${g.tenantId}/${post.id}-${Date.now()}.png`;
  const up = await fetch(`${cfg.url}/storage/v1/object/post-images/${path}`, {
    method: "POST",
    // Legacy JWT keys go in Authorization; sb_secret_ keys only as apikey.
    headers: {
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
      apikey: key,
      "Content-Type": "image/png",
      "x-upsert": "true",
    },
    body: bytes,
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!up?.ok) return { ok: false as const, error: "Could not save the picture. Try again." };
  const url = `${cfg.url}/storage/v1/object/public/post-images/${path}`;
  const res = await setPicture(g.tenantId, post.id, { image_url: url });
  return res.ok ? { ok: true as const, url } : res;
}
