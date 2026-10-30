// Pure helpers for "Plan my month": AI-written Google posts. Client-safe.
// No em dashes in this copy (AGENTS.md).

export type PostButton = "LEARN_MORE" | "CALL" | "BOOK" | "ORDER";
export const POST_BUTTONS: PostButton[] = ["LEARN_MORE", "CALL", "BOOK", "ORDER"];

export interface PlannedPost {
  text: string;
  button: PostButton | null;
}

const MAX_LEN = 750;

// Minutes ahead of UTC for Europe/London on that moment (0 in winter, 60 in
// summer time).
function londonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "shortOffset",
  }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -mins : mins;
}

// The UTC moment for a wall-clock time in London.
export function londonTime(y: number, month: number, d: number, h: number, min = 0): Date {
  const guess = new Date(Date.UTC(y, month, d, h, min));
  return new Date(guess.getTime() - londonOffsetMinutes(guess) * 60000);
}

// Four Tuesdays at 11am London time, one a week, starting with the first
// Tuesday that is at least a day away. Worked example: on Friday 30 October
// the posts go out on 3, 10, 17 and 24 November.
export function planDates(now: Date, weekday = 2, hour = 11): string[] {
  const out: string[] = [];
  const londonDay = new Date(now.getTime() + londonOffsetMinutes(now) * 60000);
  const y = londonDay.getUTCFullYear();
  const m = londonDay.getUTCMonth();
  let d = londonDay.getUTCDate() + ((weekday - londonDay.getUTCDay() + 7) % 7);
  let first = londonTime(y, m, d, hour);
  if (first.getTime() - now.getTime() < 24 * 3600_000) {
    d += 7;
    first = londonTime(y, m, d, hour);
  }
  for (let i = 0; i < 4; i++) {
    const day = new Date(Date.UTC(y, m, d + i * 7));
    out.push(
      londonTime(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour).toISOString(),
    );
  }
  return out;
}

// UK dates worth a mention in the next few weeks.
const EVENTS: { m: number; d: number; name: string }[] = [
  { m: 0, d: 1, name: "New Year" },
  { m: 1, d: 14, name: "Valentine's Day" },
  { m: 2, d: 1, name: "St David's Day" },
  { m: 2, d: 17, name: "St Patrick's Day" },
  { m: 4, d: 1, name: "the May bank holiday" },
  { m: 5, d: 21, name: "the start of summer" },
  { m: 7, d: 25, name: "the August bank holiday" },
  { m: 8, d: 1, name: "back to school" },
  { m: 9, d: 31, name: "Halloween" },
  { m: 10, d: 5, name: "Bonfire Night" },
  { m: 10, d: 30, name: "St Andrew's Day" },
  { m: 11, d: 1, name: "the run-up to Christmas" },
  { m: 11, d: 25, name: "Christmas" },
  { m: 11, d: 31, name: "New Year's Eve" },
];

export function seasonNotes(now: Date, days = 35): string[] {
  const out: string[] = [];
  for (const e of EVENTS) {
    for (const y of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
      const t = Date.UTC(y, e.m, e.d);
      const ahead = (t - now.getTime()) / 86400000;
      if (ahead >= -1 && ahead <= days) {
        out.push(
          `${e.name} (${new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })})`,
        );
      }
    }
  }
  return out;
}

// Tidy one post: no em or en dashes, no phone numbers (Google refuses them),
// at most one emoji, and a sensible length.
export function tidyPost(raw: string): string {
  let t = String(raw ?? "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\b(?:\+?44\s?|0)7\d{3}\s?\d{6}\b/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  let seen = 0;
  t = t.replace(/\p{Extended_Pictographic}️?/gu, (e) => (++seen > 1 ? "" : e));
  if (t.length > MAX_LEN) {
    const cut = t.slice(0, MAX_LEN);
    const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    t = (stop > 200 ? cut.slice(0, stop + 1) : cut).trim();
  }
  return t;
}

// Reads the AI answer: {"posts":[{"text": "...", "button": "BOOK"|null}, ...]}
// as tool input JSON or as JSON inside text. Returns up to 4 usable posts.
export function parsePlan(text: string): PlannedPost[] {
  const m = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!m) return [];
  let o: unknown;
  try {
    o = JSON.parse(m[0]);
  } catch {
    return [];
  }
  const list = (o as { posts?: unknown })?.posts;
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => {
      const x = (p ?? {}) as { text?: unknown; button?: unknown };
      const b = String(x.button ?? "").toUpperCase();
      return {
        text: tidyPost(String(x.text ?? "")),
        button: (POST_BUTTONS as string[]).includes(b) ? (b as PostButton) : null,
      };
    })
    .filter((p) => p.text.length >= 40)
    .slice(0, 4);
}
