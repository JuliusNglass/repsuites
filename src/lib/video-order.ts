// Explainer video service (sold as Accelur8): packs and brief checks.
// Pure logic, safe to unit test. No em dashes in user-facing copy.

export const VIDEO_PACKS = {
  one: { videos: 1, pence: 5000, label: "1 explainer video" },
  three: { videos: 3, pence: 10000, label: "3 explainer videos" },
} as const;
export type VideoPack = keyof typeof VIDEO_PACKS;

export const VIDEO_GOALS = {
  enquiries: "More enquiries",
  sales: "More sales",
  list: "Grow my list",
  trust: "Build trust before people call",
} as const;
export type VideoGoal = keyof typeof VIDEO_GOALS;

export const VIDEO_SESSION_RE = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;

export interface VideoBrief {
  name: string;
  business: string;
  phone: string;
  site: string;
  customers: string[];
  goal: VideoGoal;
  brand: string;
  notes: string;
}

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Tidies a brief. Returns a problem in plain English, or the clean brief. */
export function checkBrief(
  raw: Record<string, unknown>,
): { ok: true; brief: VideoBrief } | { ok: false; error: string } {
  const customers = [raw["c1"], raw["c2"], raw["c3"]].map((c) => clean(c, 600)).filter(Boolean);
  const goal = clean(raw["goal"], 20) as VideoGoal;
  const brief: VideoBrief = {
    name: clean(raw["name"], 120),
    business: clean(raw["business"], 160),
    phone: clean(raw["phone"], 40),
    site: clean(raw["site"], 300),
    customers,
    goal,
    brand: clean(raw["brand"], 600),
    notes: clean(raw["notes"], 1500),
  };
  if (!brief.name) return { ok: false, error: "Please add your name." };
  if (!brief.business) return { ok: false, error: "Please add your business name." };
  if (!customers.length)
    return { ok: false, error: "Please describe at least one ideal customer." };
  if (!(goal in VIDEO_GOALS))
    return { ok: false, error: "Please pick what you want the videos to do." };
  return { ok: true, brief };
}

export function briefText(b: VideoBrief, pack: VideoPack, email: string): string {
  return [
    `Pack: ${VIDEO_PACKS[pack].label}`,
    `Name: ${b.name}`,
    `Business: ${b.business}`,
    `Email: ${email}`,
    `Phone: ${b.phone || "-"}`,
    `Website or social: ${b.site || "-"}`,
    `Goal: ${VIDEO_GOALS[b.goal]}`,
    ...b.customers.map((c, i) => `Ideal customer ${i + 1}: ${c}`),
    `Brand colours and characters: ${b.brand || "-"}`,
    `Notes: ${b.notes || "-"}`,
  ].join("\n");
}
