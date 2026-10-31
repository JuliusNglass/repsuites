// The Pipeline tab: which prospects were really sent a message, the status
// line on each card, and the work-queue filters. Pure, so it is easy to test.
// No em dashes in this copy (AGENTS.md).

export const SENT_VIA = ["whatsapp", "email", "text", "copy", "manual"] as const;
export type SentVia = (typeof SENT_VIA)[number];

export interface PipelineItem {
  name: string;
  town: string;
  stage: string;
  score: number | null;
  sentAt: string | null;
  sentVia: string | null;
  opens: number;
  lastOpenedAt: string | null;
  videoUrl: string | null;
  videoFirstPlayedAt: string | null;
}

const LATER = ["replied", "booked", "won", "lost"];

function time(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

// "31 Oct 19:20", in UK time.
export function sentTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("hour")}:${get("minute")}`;
}

// Opened after the message was sent (opens before sending never count).
export function openedSinceSent(p: Pick<PipelineItem, "sentAt" | "opens" | "lastOpenedAt">) {
  return !!p.sentAt && p.opens > 0 && time(p.lastOpenedAt) > time(p.sentAt);
}

const VIA_LABEL: Record<string, string> = {
  whatsapp: "Sent by WhatsApp",
  email: "Sent by email",
  text: "Sent by text",
  copy: "Sent (copied message)",
  manual: "Marked as sent",
};

export type StatusTone = "grey" | "amber" | "green";

// The line under the name: has a message gone out yet?
// Worked example: sent on WhatsApp at 7:20pm on 31 October gives
// "Sent by WhatsApp 31 Oct 19:20" in green.
export function sendStatus(p: Pick<PipelineItem, "sentAt" | "sentVia" | "videoUrl">): {
  tone: StatusTone;
  text: string;
  sent: boolean;
} {
  if (p.sentAt) {
    const label = VIA_LABEL[p.sentVia ?? ""] ?? "Sent";
    const when = sentTime(p.sentAt);
    return { tone: "green", text: when ? `${label} ${when}` : label, sent: true };
  }
  if (p.videoUrl) return { tone: "amber", text: "Ready to send: video added", sent: false };
  return { tone: "grey", text: "Not sent yet", sent: false };
}

// "Opened 2 times since you sent it", "Not opened yet", or "" if not sent.
export function opensLine(p: Pick<PipelineItem, "sentAt" | "opens" | "lastOpenedAt">): string {
  if (!p.sentAt) return "";
  if (!openedSinceSent(p)) return "Not opened yet";
  return `Opened ${p.opens} time${p.opens === 1 ? "" : "s"} since you sent it`;
}

export const QUEUES = [
  { id: "todo", label: "To do (not sent)" },
  { id: "ready", label: "Ready to send" },
  { id: "waiting", label: "Sent, waiting" },
  { id: "opened", label: "Opened" },
  { id: "watched", label: "Watched video" },
  { id: "replied", label: "Replied" },
  { id: "booked", label: "Call booked" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "all", label: "All" },
] as const;
export type QueueId = (typeof QUEUES)[number]["id"];

export function inQueue(p: PipelineItem, q: QueueId): boolean {
  const active = !LATER.includes(p.stage);
  switch (q) {
    case "todo":
      return active && !p.sentAt;
    case "ready":
      return active && !p.sentAt && !!p.videoUrl;
    case "waiting":
      return active && !!p.sentAt && !openedSinceSent(p);
    case "opened":
      return active && openedSinceSent(p);
    case "watched":
      return !!p.sentAt && !!p.videoFirstPlayedAt && p.stage !== "lost";
    case "all":
      return true;
    default:
      return p.stage === q;
  }
}

// Name or town contains the search words (any case).
export function matchesSearch(p: Pick<PipelineItem, "name" | "town">, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return `${p.name} ${p.town}`.toLowerCase().includes(s);
}

// To do: best score first. Sent: newest send first. Opened: latest open
// first. Watched: latest first play. Others keep the order given.
export function sortQueue<T extends PipelineItem>(list: T[], q: QueueId): T[] {
  const out = [...list];
  const by = (f: (p: T) => number) => out.sort((a, b) => f(b) - f(a));
  if (q === "todo" || q === "ready") by((p) => p.score ?? -1);
  else if (q === "waiting") by((p) => time(p.sentAt));
  else if (q === "opened") by((p) => time(p.lastOpenedAt));
  else if (q === "watched") by((p) => time(p.videoFirstPlayedAt));
  return out;
}

export function queueCounts(list: PipelineItem[]): Record<QueueId, number> {
  const c = {} as Record<QueueId, number>;
  for (const q of QUEUES) c[q.id] = list.filter((p) => inQueue(p, q.id)).length;
  return c;
}

// The search phrases a saved report checked, main one first: the Maps
// keyword (or the first grid's), then the other grids. No repeats, at most 3.
// Worked example: maps "car wash", grids "car wash" and "valeting" gives
// ["car wash", "valeting"].
export function savedPhrases(
  row:
    | { prev_kw?: string | null; g0?: string | null; g1?: string | null; g2?: string | null }
    | null
    | undefined,
): string[] {
  if (!row) return [];
  const list = [row.prev_kw || row.g0, row.g0, row.g1, row.g2]
    .map((k) => (k ?? "").trim().toLowerCase())
    .filter(Boolean);
  return list.filter((k, i) => list.indexOf(k) === i).slice(0, 3);
}

// Today's date in the UK ("2026-10-31"), for follow-ups. UTC would show
// yesterday's list between midnight and 1am in summer.
export function londonDate(now: Date = new Date(), offsetDays = 0): string {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
