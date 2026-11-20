// Explainer video scripts: types, approval copy and the reminder schedule.
// Pure logic, safe to unit test. Customer copy is signed Accelur8, has no
// opt-out line, no personal names and no em dashes.

export interface Scene {
  /** The sentence the voice says. */
  line: string;
  /** What the viewer sees, in plain words (no image is made yet). */
  picture: string;
  /** The few words written on screen, or "". */
  words: string;
}

export interface VideoScript {
  title: string;
  scenes: Scene[];
}

export const FREE_ROUNDS = 2;

export const CHANGE_REASONS = {
  tone: "The tone does not sound like us",
  wording: "Some wording is wrong",
  pictures: "The pictures described are not right",
  length: "It is too long or too short",
  offer: "The offer or call to action is wrong",
} as const;
export type ChangeReason = keyof typeof CHANGE_REASONS;

const DAY = 86_400_000;

/**
 * Which chase is due for a script that is waiting on the client.
 * Day 2: text. Day 4: email. Day 6: task for Accelur8 to follow up by hand.
 */
export function reminderDue(sentAt: string | null, done: number, now: Date): 1 | 2 | 3 | null {
  if (!sentAt) return null;
  const days = (now.getTime() - new Date(sentAt).getTime()) / DAY;
  if (done < 1 && days >= 2) return 1;
  if (done < 2 && days >= 4) return 2;
  if (done < 3 && days >= 6) return 3;
  return null;
}

export const approveLink = (token: string) => `https://repsuites.com/videos/approve/${token}`;

const first = (name: string) => name.trim().split(/\s+/)[0] || "there";

export function scriptReadySms(name: string, token: string, round: number): string {
  return round > 0
    ? `Hi ${first(name)}, your updated video script is ready. Have a look and tap Approve or Request changes: ${approveLink(token)} Accelur8`
    : `Hi ${first(name)}, your video script is ready. Read it in 2 minutes, then tap Approve or Request changes: ${approveLink(token)} Accelur8`;
}

export function reminderSms(name: string, token: string): string {
  return `Hi ${first(name)}, your video is waiting on one tap from you. Approve the script, or tell us what to change: ${approveLink(token)} Accelur8`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function scriptEmail(
  name: string,
  business: string,
  script: VideoScript,
  token: string,
  opts: { round?: number; reminder?: boolean } = {},
): { subject: string; html: string; text: string } {
  const link = approveLink(token);
  const subject = opts.reminder
    ? `${first(name)}, your ${business} video is waiting for you`
    : (opts.round ?? 0) > 0
      ? `Your updated video script for ${business}`
      : `Your video script for ${business} is ready`;
  const intro = opts.reminder
    ? "Nothing gets made until you say yes, so your video is on hold. It takes 2 minutes to read."
    : "Here is the script for your video. Each scene shows what the voice says and what people will see. Nothing gets made until you say yes.";
  const rows = script.scenes
    .map(
      (s, i) =>
        `<tr><td style="padding:12px 0;border-top:1px solid #e2e8f0;vertical-align:top;width:28px;font-weight:700">${i + 1}</td><td style="padding:12px 0;border-top:1px solid #e2e8f0"><p style="margin:0 0 6px"><b>Voice:</b> ${esc(s.line)}</p><p style="margin:0 0 6px;color:#334155"><b>You see:</b> ${esc(s.picture)}</p>${s.words ? `<p style="margin:0;color:#334155"><b>On screen:</b> ${esc(s.words)}</p>` : ""}</td></tr>`,
    )
    .join("");
  const button = (label: string, bg: string) =>
    `<a href="${link}" style="background:${bg};color:#0f172a;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px;display:inline-block;margin:0 8px 8px 0">${label}</a>`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#0f172a;max-width:600px">
<p>Hi ${esc(first(name))},</p>
<p>${intro}</p>
<p style="font-size:18px;font-weight:700;margin:20px 0 8px">${esc(script.title)}</p>
<table style="border-collapse:collapse;width:100%">${rows}</table>
<p style="margin:24px 0 8px">${button("Approve script", "#f5b324")}${button("Request changes", "#e2e8f0")}</p>
<p>You get ${FREE_ROUNDS} rounds of changes free. Once you approve, we make the video in your brand colours.</p>
<p>Accelur8</p></div>`;
  const text = [
    `Hi ${first(name)},`,
    "",
    intro,
    "",
    script.title,
    "",
    ...script.scenes.map(
      (s, i) =>
        `${i + 1}. Voice: ${s.line}\n   You see: ${s.picture}${s.words ? `\n   On screen: ${s.words}` : ""}`,
    ),
    "",
    `Approve or request changes: ${link}`,
    "",
    "Accelur8",
  ].join("\n");
  return { subject, html, text };
}

/** Tidies a script from the AI. Returns null if it is unusable. */
export function cleanScript(raw: unknown): VideoScript | null {
  const r = raw as { title?: unknown; scenes?: unknown };
  const tidy = (v: unknown, max: number) =>
    String(v ?? "")
      .replace(/—|–/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  const scenes = (Array.isArray(r?.scenes) ? r.scenes : [])
    .map((s: { line?: unknown; picture?: unknown; words?: unknown }) => ({
      line: tidy(s?.line, 300),
      picture: tidy(s?.picture, 400),
      words: tidy(s?.words, 60),
    }))
    .filter((s) => s.line && s.picture)
    .slice(0, 12);
  const title = tidy(r?.title, 120);
  if (!title || scenes.length < 4) return null;
  return { title, scenes };
}
