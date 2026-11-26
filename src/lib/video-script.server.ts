/* eslint-disable @typescript-eslint/no-explicit-any -- AI and GHL JSON are checked field by field. */
// Server-only: explainer video scripts. After the brief, the AI writes a
// script (one scene per sentence), the client gets it by text and email with
// an approval link, gets chased on day 2, 4 and 6, and an approved order
// waits in the render queue (picked up by a Claude scheduled task for now).
import { crmFetch } from "./crm-store.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { sendEmail } from "./email.server";
import { sendAccelur8Sms } from "./hq.server";
import { inSendWindow } from "./check-followups";
import { ALERT_USER_ID } from "./growth-lead";
import { VIDEO_GOALS, type VideoBrief, type VideoPack } from "./video-order";
import {
  CHANGE_REASONS,
  FREE_ROUNDS,
  cleanScript,
  reminderDue,
  reminderSms,
  scriptEmail,
  scriptReadySms,
  type ChangeReason,
  type VideoScript,
} from "./video-script";

const NOTIFY = "julius@accelur8.com";

export interface VideoOrderRow {
  id: string;
  token: string;
  session_id: string;
  pack: VideoPack;
  name: string;
  business: string;
  email: string;
  phone: string;
  contact_id: string | null;
  brief: VideoBrief;
  script: VideoScript | null;
  status: string;
  round: number;
  feedback: { at: string; reasons: string[]; note: string }[];
  reminders: number;
  sent_at: string | null;
  approved_at: string | null;
  video_url: string | null;
}

async function ghl(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token) return null;
  try {
    return await crmFetch(`${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
}

const tag = (cid: string | null, tags: string[]) =>
  cid ? ghl(`/contacts/${cid}/tags`, { method: "POST", body: JSON.stringify({ tags }) }) : null;

// Texts go from the Accelur8 SparkOps number (replies land in SparkOps), not GHL.
const sms = async (phone: string | null | undefined, message: string, key: string) =>
  phone
    ? { ok: await sendAccelur8Sms({ phone, message, idempotencyKey: key, source: "video_order" }) }
    : null;

/** In-app alert for Accelur8: a GHL task, due in an hour. */
const task = (cid: string | null, title: string, body: string) =>
  cid
    ? ghl(`/contacts/${cid}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title,
          body,
          dueDate: new Date(Date.now() + 3_600_000).toISOString(),
          completed: false,
          assignedTo: ALERT_USER_ID,
        }),
      })
    : null;

const SYSTEM = `You write scripts for short hand-drawn doodle explainer videos for UK small businesses. Rules:
- About 30 seconds spoken: 6 to 8 scenes, one sentence per scene, 70 to 90 words in total.
- Scene 1 is a hook that does not sound like an ad: a relatable moment or contrast the ideal customer will recognise.
- Speak to the customer's problem in their words, then show how this business solves it, then one clear call to action as the last scene.
- Plain UK English a 15 year old understands. No jargon, no em dashes, no prices unless the brief gives them, no made-up facts, awards, numbers or reviews.
- "picture" describes the hand-drawn scene in plain words for the client: 2 to 4 things revealed left to right, using the business's brand colours and characters if the brief gives them. People in cleaning and care businesses are drawn as women unless the brief says otherwise.
- "words" is at most 3 short words written on screen, or empty.
- The title is a short, catchy name for the video that the client sees. Never mention versions or changes in it.`;

async function writeScript(
  b: VideoBrief,
  extra: { previous?: VideoScript; feedback?: string },
): Promise<VideoScript | null> {
  const key = (process.env["REPSUITES_ANTHROPIC_API_KEY"] ?? "").trim();
  if (!key) {
    console.error("video script: no AI key");
    return null;
  }
  const str = { type: "string" };
  const brief = [
    `Business: ${b.business}`,
    `Website or social: ${b.site || "not given"}`,
    `Goal of the video: ${VIDEO_GOALS[b.goal]}`,
    ...b.customers.map((c, i) => `Ideal customer ${i + 1}: ${c}`),
    `Brand colours, characters and style: ${b.brand || "not given, use friendly yellow and light blue accents"}`,
    `Notes: ${b.notes || "none"}`,
  ].join("\n");
  const ask = extra.previous
    ? `${brief}\n\nThe client asked for changes to this script:\n${JSON.stringify(extra.previous)}\n\nTheir feedback:\n${extra.feedback}\n\nWrite the new version. Keep what they did not ask to change. Record it with the video_script tool.`
    : `${brief}\n\nWrite the script and record it with the video_script tool.`;
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
        max_tokens: 3000,
        system: SYSTEM,
        tools: [
          {
            name: "video_script",
            description: "Record the video script.",
            input_schema: {
              type: "object",
              properties: {
                title: str,
                scenes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { line: str, picture: str, words: str },
                    required: ["line", "picture", "words"],
                  },
                },
              },
              required: ["title", "scenes"],
            },
          },
        ],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: ask }],
      }),
    });
    if (!res.ok) {
      console.error("video script: AI failed", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const j = (await res.json()) as any;
    const use = (j?.content ?? []).find((c: any) => c?.type === "tool_use");
    const out = cleanScript(use?.input);
    if (!out) console.error("video script: unusable AI output", j?.stop_reason);
    return out;
  } catch (e) {
    console.error("video script: AI error", e);
    return null;
  }
}

async function patch(id: string, body: Record<string, unknown>) {
  return serviceWrite(`video_orders?id=eq.${id}`, "", {
    method: "PATCH",
    body: { ...body, updated_at: new Date().toISOString() },
  });
}

/** Sends the script (first or updated) to the client by text and email. */
async function sendScript(o: VideoOrderRow, script: VideoScript, round: number) {
  const mail = o.email
    ? await sendEmail({
        to: o.email,
        replyTo: NOTIFY,
        fromName: "Accelur8",
        ...scriptEmail(o.name, o.business, script, o.token, { round }),
      })
    : { ok: false as const };
  const text = await sms(
    o.phone,
    scriptReadySms(o.name, o.token, round),
    `video-${o.id}-script-${round}`,
  );
  await patch(o.id, {
    script,
    round,
    status: "sent",
    sent_at: new Date().toISOString(),
    reminders: 0,
  });
  await tag(o.contact_id, ["video-script-sent"]);
  return mail.ok || !!text?.ok;
}

/** Called once the brief is saved. Never throws. */
export async function startScript(input: {
  sessionId: string;
  pack: VideoPack;
  email: string;
  phone: string;
  contactId: string | null;
  brief: VideoBrief;
}) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const ins = await serviceWrite<VideoOrderRow[]>("video_orders?on_conflict=session_id", "", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
    body: {
      token,
      session_id: input.sessionId,
      pack: input.pack,
      name: input.brief.name,
      business: input.brief.business,
      email: input.email,
      phone: input.brief.phone || input.phone,
      contact_id: input.contactId,
      brief: input.brief,
    },
  });
  const o = ins.data?.[0];
  if (!o) return; // Already started for this payment.
  const script = await writeScript(input.brief, {});
  if (!script) {
    await patch(o.id, { status: "stuck" });
    await task(
      o.contact_id,
      `Video script failed: ${o.business}`,
      "The AI could not write the script. Write it by hand, or re-run it from the render task.",
    );
    return;
  }
  await sendScript(o, script, 0);
}

export async function readByToken(token: string): Promise<VideoOrderRow | null> {
  const r = await serviceRead<VideoOrderRow[]>(
    `video_orders?token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
    "",
  );
  return r.data?.[0] ?? null;
}

export async function decide(
  token: string,
  d: { approve: true } | { approve: false; reasons: ChangeReason[]; note: string },
) {
  const o = await readByToken(token);
  if (!o || !o.script) return { ok: false as const, error: "We could not find this script." };
  if (o.status !== "sent")
    return {
      ok: true as const,
      status: o.status,
      message: "We already have your answer. Thank you.",
    };
  if (d.approve) {
    await patch(o.id, { status: "approved", approved_at: new Date().toISOString() });
    await tag(o.contact_id, ["video-approved"]);
    await task(
      o.contact_id,
      `Script approved: ${o.business}`,
      "The client approved the script. The video is in the render queue.",
    );
    return { ok: true as const, status: "approved" };
  }
  const feedback = [
    ...o.feedback,
    { at: new Date().toISOString(), reasons: d.reasons, note: d.note },
  ];
  await patch(o.id, { status: "changes", feedback });
  await tag(o.contact_id, ["video-changes"]);
  if (o.round >= FREE_ROUNDS) {
    await task(
      o.contact_id,
      `Video changes past free rounds: ${o.business}`,
      `Round ${o.round + 1} requested. Reasons: ${d.reasons.map((r) => CHANGE_REASONS[r]).join("; ") || "-"}. Note: ${d.note || "-"}`,
    );
    return { ok: true as const, status: "changes" };
  }
  const why = [...d.reasons.map((r) => CHANGE_REASONS[r]), d.note].filter(Boolean).join("\n");
  const next = await writeScript(o.brief, { previous: o.script, feedback: why });
  if (!next) {
    await task(o.contact_id, `Video rewrite failed: ${o.business}`, `Feedback: ${why}`);
    return { ok: true as const, status: "changes" };
  }
  await sendScript(o, next, o.round + 1);
  return { ok: true as const, status: "resent" };
}

/** Day 2 text, day 4 email, day 6 task. Runs every 30 minutes. */
export async function runVideoReminders() {
  const now = new Date();
  if (!inSendWindow(now)) return { sent: 0, skipped: "outside hours" };
  const r = await serviceRead<VideoOrderRow[]>(
    "video_orders?status=eq.sent&reminders=lt.3&select=*&limit=50",
    "",
  );
  let sent = 0;
  for (const o of r.data ?? []) {
    const step = reminderDue(o.sent_at, o.reminders, now);
    if (!step || !o.script) continue;
    let ok = false;
    if (step === 1)
      ok = !!(await sms(o.phone, reminderSms(o.name, o.token), `video-${o.id}-remind-1`))?.ok;
    if (step === 2)
      ok = o.email
        ? (
            await sendEmail({
              to: o.email,
              replyTo: NOTIFY,
              fromName: "Accelur8",
              ...scriptEmail(o.name, o.business, o.script, o.token, { reminder: true }),
            })
          ).ok
        : true;
    if (step === 3)
      ok = !!(
        await task(
          o.contact_id,
          `Follow up: ${o.business} has not approved their script`,
          "Six days since the script went out, with a text and an email reminder. Give them a quick call or message.",
        )
      )?.ok;
    // A failed send is not counted, so the next run retries it.
    if (ok) {
      await patch(o.id, { reminders: step });
      sent++;
    }
  }
  return { sent };
}

/** Approved orders waiting to be made, for the render task. */
export async function renderQueue() {
  const r = await serviceRead<VideoOrderRow[]>(
    "video_orders?status=in.(approved,rendering)&select=id,business,pack,brief,script,status,approved_at,contact_id&order=approved_at.asc&limit=10",
    "",
  );
  return r.data ?? [];
}

export async function markRender(id: string, status: "rendering" | "ready", videoUrl?: string) {
  const o = await serviceRead<VideoOrderRow[]>(`video_orders?id=eq.${id}&select=*&limit=1`, "");
  const row = o.data?.[0];
  if (!row) return false;
  await patch(id, { status, ...(videoUrl ? { video_url: videoUrl.slice(0, 500) } : {}) });
  if (status === "ready")
    await task(
      row.contact_id,
      `Video ready to check: ${row.business}`,
      `Watch it, then send it to the client. ${videoUrl ?? ""}`,
    );
  return true;
}
