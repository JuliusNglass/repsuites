// Writes and delivers the Fix-It Pack in minutes. Called by the thank-you
// page (so most buyers watch it arrive) and every 5 minutes by the database
// as a backstop. Claims each order first, so it is only written once.
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { sendEmail } from "./email.server";
import type { Report } from "./prospects.server";

export type FixitPack = {
  description: string;
  primaryCategory: string;
  extraCategories: string[];
  services: { name: string; description: string }[];
  posts: string[];
  replies: { when: string; reply: string }[];
  checklist: string[];
};

export type FixitOrder = {
  id: string;
  stripe_session_id: string;
  view_key: string;
  report_token: string | null;
  business: string | null;
  email: string | null;
  name: string | null;
  status: string;
  attempts: number;
  pack: FixitPack | null;
  ready_at: string | null;
  emailed_at: string | null;
  extras: FixitExtras | null;
};

export type FixitExtras = { areas?: string; services?: string; different?: string };

const COLS =
  "id,stripe_session_id,view_key,report_token,business,email,name,status,attempts,pack,ready_at,emailed_at,extras";
const ORIGIN = "https://repsuites.com";

/** Saves a paid order (from the Stripe webhook). Safe to call twice. */
export async function recordFixitOrder(session: any) {
  const cust = session?.customer_details ?? {};
  const token = String(session?.metadata?.token ?? "");
  await serviceWrite("fixit_orders?on_conflict=stripe_session_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: {
      stripe_session_id: String(session.id),
      report_token: /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : null,
      business: String(session?.metadata?.business ?? "") || null,
      email: cust.email ? String(cust.email).toLowerCase() : null,
      phone: cust.phone ? String(cust.phone) : null,
      name: cust.name ? String(cust.name) : null,
    },
  });
}

export async function orderBySession(sessionId: string): Promise<FixitOrder | null> {
  const r = await serviceRead<FixitOrder[]>(
    `fixit_orders?select=${COLS}&stripe_session_id=eq.${encodeURIComponent(sessionId)}`,
    "",
  );
  return r.data?.[0] ?? null;
}

export async function orderByKey(key: string): Promise<FixitOrder | null> {
  if (!/^[a-f0-9]{36}$/.test(key)) return null;
  const r = await serviceRead<FixitOrder[]>(`fixit_orders?select=${COLS}&view_key=eq.${key}`, "");
  return r.data?.[0] ?? null;
}

export async function findReport(o: FixitOrder): Promise<{ token: string; report: Report } | null> {
  const q = o.report_token
    ? `report_token=eq.${o.report_token}`
    : o.email
      ? `email=eq.${encodeURIComponent(o.email)}&order=report_at.desc`
      : null;
  if (!q) return null;
  const r = await serviceRead<{ report_token: string; report: Report | null }[]>(
    `prospects?select=report_token,report&${q}&limit=1`,
    "",
  );
  const row = r.data?.[0];
  return row?.report ? { token: row.report_token, report: row.report } : null;
}

const SYSTEM = `You write Google Business Profile fixes for small UK local businesses.
Plain UK English a 16 year old can read. Short sentences. No em dashes, no hype, no made-up facts:
never invent awards, years in business, prices, staff names or guarantees. Only use what the data says,
and the obvious services for this kind of business. Use the search phrase customers use, naturally.
Google rules: description up to 750 characters, no links or phone numbers in it; posts up to 1500
characters, friendly, each ends with a simple call to action. Always answer by calling the tool.`;

function promptFor(report: Report, keyword: string, x: FixitExtras | null): string {
  const b = report.business;
  return `Write the Fix-It Pack for this business.
Business: ${b.name}
Google category now: ${b.category || "unknown"}
Town / address: ${b.town || ""} ${b.address || ""}
What customers search for: ${keyword}
Rating: ${b.rating ?? "none"} from ${b.reviews} reviews. Website: ${b.website || "none"}.
Current description: ${report.profileAudit?.description || "none or not readable"}
Nearby businesses beating them: ${report.rivals
    .slice(0, 5)
    .map((r) => `${r.name} (${r.reviews} reviews, ${r.kind ?? ""})`)
    .join("; ")}
${x?.areas ? `Areas they cover (from the owner): ${x.areas}\n` : ""}${x?.services ? `Services to mention (from the owner): ${x.services}\n` : ""}${x?.different ? `What makes them different (from the owner): ${x.different}\n` : ""}Use the owner's own answers above where given; they beat guesses.
Give: a new description; the best primary Google category and 3 to 6 extra categories (real Google
category names); 6 to 10 services with one-line descriptions; 4 Google posts for the next 4 weeks;
3 review replies they can reuse (a 5-star review, a mixed review, an unhappy review) with [Name] where
the reviewer's name goes; and a numbered checklist of the exact steps, in order, to make these changes
in their Google Business Profile.`;
}

async function writePack(
  report: Report,
  x: FixitExtras | null,
): Promise<FixitPack | { error: string }> {
  const key = (process.env["REPSUITES_ANTHROPIC_API_KEY"] ?? "").trim();
  if (!key) return { error: "AI key missing" };
  const keyword = report.maps?.keyword || report.business.category || "local services";
  const str = { type: "string" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(110000),
      body: JSON.stringify({
        model: (process.env["REPSUITES_POSTS_MODEL"] ?? "").trim() || "claude-sonnet-5-5",
        max_tokens: 6000,
        system: SYSTEM,
        tools: [
          {
            name: "fixit_pack",
            description: "Record the Fix-It Pack.",
            input_schema: {
              type: "object",
              properties: {
                description: str,
                primaryCategory: str,
                extraCategories: { type: "array", items: str },
                services: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: str, description: str },
                    required: ["name", "description"],
                  },
                },
                posts: { type: "array", items: str, minItems: 4, maxItems: 4 },
                replies: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { when: str, reply: str },
                    required: ["when", "reply"],
                  },
                },
                checklist: { type: "array", items: str },
              },
              required: [
                "description",
                "primaryCategory",
                "extraCategories",
                "services",
                "posts",
                "replies",
                "checklist",
              ],
            },
          },
        ],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: promptFor(report, keyword, x) }],
      }),
    });
    if (!res.ok) return { error: `AI ${res.status}` };
    const body = (await res.json()) as { content?: any[] };
    const used = (body.content ?? []).find((c) => c?.type === "tool_use");
    const p = used?.input as FixitPack | undefined;
    if (!p?.description || !Array.isArray(p.posts)) return { error: "AI gave no pack" };
    const clean = (s: unknown) =>
      String(s ?? "")
        .replace(/—/g, "-")
        .trim();
    return {
      description: clean(p.description).slice(0, 750),
      primaryCategory: clean(p.primaryCategory),
      extraCategories: (p.extraCategories ?? []).map(clean).filter(Boolean).slice(0, 8),
      services: (p.services ?? [])
        .map((s) => ({ name: clean(s.name), description: clean(s.description) }))
        .filter((s) => s.name)
        .slice(0, 12),
      posts: p.posts.map(clean).filter(Boolean).slice(0, 4),
      replies: (p.replies ?? [])
        .map((r) => ({ when: clean(r.when), reply: clean(r.reply) }))
        .slice(0, 4),
      checklist: (p.checklist ?? []).map(clean).filter(Boolean).slice(0, 15),
    };
  } catch {
    return { error: "AI timed out" };
  }
}

async function emailPack(o: FixitOrder) {
  if (!o.email) return;
  const url = `${ORIGIN}/fix/pack/${o.view_key}`;
  const first = String(o.name ?? "").split(/\s+/)[0] || "there";
  const r = await sendEmail({
    to: o.email,
    subject: `Your Google Fix-It Pack${o.business ? ` for ${o.business}` : ""} is ready`,
    html: `<p>Hi ${first},</p><p>Your Google Fix-It Pack is ready. Everything is written for you, with a copy button next to each part and the steps in order.</p><p><a href="${url}" style="display:inline-block;background:#0b1d3a;color:#fff;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:700">Open my Fix-It Pack</a></p><p><b>Your bonus:</b> a free month of RepSuites Growth (normally £49, no card needed). It asks your customers for reviews and writes your review replies, so the fixes keep working.</p><p><a href="https://repsuites.com/start?bonus=${o.view_key}" style="color:#0b1d3a;font-weight:700">Turn on my free month</a></p><p>Most owners finish it in about 20 minutes. If anything is not right, just reply to this email and we will sort it.</p><p>Accelur8</p>`,
    text: `Hi ${first}, your Google Fix-It Pack is ready: ${url}  Reply to this email if anything is not right. Accelur8`,
    replyTo: "julius@accelur8.com",
  });
  if (r.ok)
    await serviceWrite(`fixit_orders?id=eq.${o.id}`, "", {
      method: "PATCH",
      body: { emailed_at: new Date().toISOString() },
    });
}

/** Writes one order if nobody else is. Returns the order as it now stands. */
export async function processFixit(o: FixitOrder): Promise<FixitOrder> {
  if (o.status === "ready") {
    if (!o.emailed_at) await emailPack(o);
    return o;
  }
  const stale = o.status === "writing";
  if (o.status !== "paid" && !stale) return o;
  const claim = await serviceWrite<FixitOrder[]>(
    `fixit_orders?id=eq.${o.id}&status=eq.${o.status}&attempts=eq.${o.attempts}`,
    "",
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { status: "writing", writing_at: new Date().toISOString(), attempts: o.attempts + 1 },
    },
  );
  if (!claim.data?.length) return o; // someone else is writing it
  const found = await findReport(o);
  if (!found) {
    await serviceWrite(`fixit_orders?id=eq.${o.id}`, "", {
      method: "PATCH",
      body: { status: "needs_info", error: "No report found for this order" },
    });
    return { ...o, status: "needs_info" };
  }
  const pack = await writePack(found.report, o.extras);
  if ("error" in pack) {
    await serviceWrite(`fixit_orders?id=eq.${o.id}`, "", {
      method: "PATCH",
      body: { status: o.attempts + 1 >= 3 ? "failed" : "paid", error: pack.error },
    });
    return { ...o, status: "paid" };
  }
  const done = {
    ...o,
    status: "ready",
    pack,
    report_token: found.token,
    business: o.business || found.report.business.name,
    ready_at: new Date().toISOString(),
  };
  await serviceWrite(`fixit_orders?id=eq.${o.id}`, "", {
    method: "PATCH",
    body: {
      status: "ready",
      pack,
      report_token: found.token,
      business: done.business,
      ready_at: done.ready_at,
      error: null,
    },
  });
  await emailPack(done);
  return done;
}

/** Backstop run by the database every 5 minutes. */
export async function runFixitQueue() {
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  // Paid orders wait 10 minutes, so buyers can answer the optional questions first.
  const paidBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const r = await serviceRead<FixitOrder[]>(
    `fixit_orders?select=${COLS}&or=(and(status.eq.paid,created_at.lt.${paidBefore}),and(status.eq.writing,writing_at.lt.${since}),and(status.eq.ready,emailed_at.is.null))&order=created_at.asc&limit=3`,
    "",
  );
  let done = 0;
  for (const o of r.data ?? []) {
    const after = await processFixit(o);
    if (after.status === "ready") done++;
  }
  return { ok: true, done };
}

/** Saves the buyer's optional answers and, if needed, builds their report. */
export async function saveFixitDetails(
  o: FixitOrder,
  d: { extras: FixitExtras; placeId?: string; keyword?: string },
): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = { extras: d.extras };
  if (!(await findReport(o))) {
    if (!d.placeId) return { ok: false, error: "Please find your business first." };
    const { saveProspectReport } = await import("./prospects.server");
    const r = await saveProspectReport(d.placeId, "inbound", {
      ...(d.keyword ? { keyword: d.keyword.toLowerCase() } : {}),
      ...(o.email ? { email: o.email } : {}),
      ...(o.name ? { contactName: o.name } : {}),
      hq: false,
    }).catch(() => null);
    if (!r?.ok) return { ok: false, error: "We could not check that business. Please try again." };
    body["report_token"] = r.token;
    if (o.status === "needs_info") body["status"] = "paid";
  }
  await serviceWrite(`fixit_orders?id=eq.${o.id}`, "", { method: "PATCH", body });
  return { ok: true };
}
