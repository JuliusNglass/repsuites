// WhatsApp-gated free Google Check. The /check form saves the lead without
// scanning. When the person replies SEND to the WhatsApp/SMS, GHL calls
// POST /api/ghl/run-scan; this runs the scan, writes the summary into the
// contact's "GC" fields and adds a tag ("gc-scan-ready" or "gc-scan-failed")
// that starts the GHL delivery workflow. Answers GHL at once and scans in the
// background, so a slow scan never times the webhook out.
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { GHL_LOCATION_ID } from "./ghl-lead";

// GHL contact field ids (Accelur8 Ltd sub-account), created for this flow.
const FIELD = {
  score: "Hz2mch3xUj3C5g2rPvTJ",
  reviews: "rAFIxmfj6dY1TGqSiZi8",
  zones: "kSeta5RE4K15c14xDp3n",
  competitor: "kWLcoO68grseqGeBnQVW",
  reviewLine: "lR2GOKlZnNJ3MDiHmoST",
  gap1: "yS9F4eGYzgGwRzxnA4QO",
  gap2: "Pw4clh49npeiwoXTdHt8",
  gap3: "O31jI7zHycjhK6rEoDvQ",
  summaryLink: "9ojakNfQF0jSfDyXKw04",
  fullReport: "52y3c2K01G7IKuOmou5d",
  status: "cSY4KtSRy5VockeZQgmG",
} as const;

/** True when /check should save leads without scanning (WhatsApp gate on). */
export function gatedCheckOn(): boolean {
  return (process.env["GC_GATED_SCAN"] ?? "").trim() === "1";
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function str(v: unknown, max = 320): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// GHL's webhook body carries the contact at the top level (email, phone,
// contact_id) and, depending on the action, inside customData.
function contactFrom(body: Record<string, unknown>) {
  const cd = (body["customData"] ?? {}) as Record<string, unknown>;
  return {
    email: (str(cd["email"]) || str(body["email"])).toLowerCase(),
    phone: str(cd["phone"], 40) || str(body["phone"], 40),
  };
}

type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  google_place_id: string | null;
  check_keyword: string | null;
};

async function findLead(email: string, phone: string): Promise<LeadRow | null> {
  const sel =
    "select=id,name,email,phone,google_place_id,check_keyword&google_place_id=not.is.null&order=created_at.desc&limit=1";
  if (email) {
    const r = await serviceRead<LeadRow[]>(
      `leads?${sel}&email=eq.${encodeURIComponent(email)}`,
      "",
    );
    if (r.data?.[0]) return r.data[0];
  }
  if (phone) {
    const digits = phone.replace(/\D/g, "").slice(-10);
    if (digits.length >= 9) {
      const r = await serviceRead<LeadRow[]>(
        `leads?${sel}&phone=ilike.*${encodeURIComponent(digits)}`,
        "",
      );
      if (r.data?.[0]) return r.data[0];
    }
  }
  return null;
}

async function pushToGhl(
  who: { email: string; phone: string },
  fields: Partial<Record<keyof typeof FIELD, string | number>>,
  tag: string,
): Promise<boolean> {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token) return false;
  const customFields = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => ({ id: FIELD[k as keyof typeof FIELD], field_value: v }));
  try {
    const r = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        locationId: GHL_LOCATION_ID,
        ...(who.email ? { email: who.email } : {}),
        ...(who.phone ? { phone: who.phone } : {}),
        customFields,
        tags: [tag],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error("GHL scan result upsert failed", r.status);
    return r.ok;
  } catch {
    return false;
  }
}

// GHL sometimes refuses a write for a moment; try three times before giving up.
async function pushWithRetry(
  who: { email: string; phone: string },
  fields: Partial<Record<keyof typeof FIELD, string | number>>,
  tag: string,
): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    if (await pushToGhl(who, fields, tag)) return true;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return false;
}

/** Runs the scan for one contact and writes the result into GHL. */
export async function runGatedScan(who: { email: string; phone: string }): Promise<string> {
  const lead = await findLead(who.email, who.phone);
  if (!lead?.google_place_id) {
    await pushWithRetry(who, { status: "not_found" }, "gc-scan-failed");
    return "not_found";
  }
  const { saveProspectReport, addProspectExtra } = await import("./prospects.server");
  const saved = await saveProspectReport(lead.google_place_id, "inbound", {
    ...(lead.email ? { email: lead.email } : {}),
    contactName: lead.name,
    ...(lead.check_keyword ? { keyword: lead.check_keyword } : {}),
    hq: false,
  }).catch(() => null);
  if (!saved?.ok) {
    await pushWithRetry(who, { status: "scan_failed" }, "gc-scan-failed");
    return "scan_failed";
  }
  const row = await serviceRead<{ report: unknown }[]>(
    `prospects?select=report&report_token=eq.${encodeURIComponent(saved.token)}&limit=1`,
    "",
  );
  const report = row.data?.[0]?.report as import("./prospects.server").Report | undefined;
  const link = `https://repsuites.com/r/${saved.token}`;
  if (!report) {
    await pushWithRetry(who, { status: "scan_failed", fullReport: link }, "gc-scan-failed");
    return "scan_failed";
  }
  const { checkSummary } = await import("./report-page.server");
  const s = checkSummary(report);
  const delivered = await pushWithRetry(
    who,
    {
      score: s.score,
      reviews: s.reviews,
      ...(s.zones !== null ? { zones: s.zones } : {}),
      competitor: s.topCompetitor,
      reviewLine: s.reviewLine,
      gap1: s.gaps[0] ?? "",
      gap2: s.gaps[1] ?? "",
      gap3: s.gaps[2] ?? "",
      summaryLink: link,
      fullReport: link,
      status: s.zones !== null ? "ready" : "ready_no_map",
    },
    "gc-scan-ready",
  );
  if (!delivered) {
    console.error("gated scan: GHL did not take the result", who.email || who.phone);
    return "ghl_failed";
  }
  // Website check last: the summary is already on its way, and the
  // background task has a time limit after GHL gets its answer.
  await addProspectExtra(lead.google_place_id, "site").catch(() => null);
  await serviceWrite(`leads?id=eq.${lead.id}`, "", {
    method: "PATCH",
    body: { scan_requested_at: new Date().toISOString() },
  }).catch(() => null);
  return "ready";
}

// POST /api/ghl/run-scan  (header x-repsuites-ghl-token)
export async function handleRunScan(request: Request, ctx: unknown): Promise<Response> {
  if (request.method !== "POST") return json(405, { ok: false });
  const secret = (process.env["GHL_SCAN_WEBHOOK_TOKEN"] ?? "").trim();
  const given = request.headers.get("x-repsuites-ghl-token") ?? "";
  if (secret.length < 32 || !safeEqual(given, secret)) return json(401, { ok: false });
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false });
  }
  const who = contactFrom(body);
  if (!who.email && !who.phone) return json(400, { ok: false, error: "no contact" });
  const task = runGatedScan(who).catch((e) => {
    console.error("gated scan failed", e);
    return "error";
  });
  const waitUntil = (ctx as { waitUntil?: (p: Promise<unknown>) => void } | null)?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil.call(ctx, task);
    return json(202, { ok: true, queued: true });
  }
  return json(200, { ok: true, result: await task });
}
