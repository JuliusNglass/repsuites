// Free visibility check requests from the public homepage.
// Saves the request, then (if email is set up) tells Accelur8 a request came
// in so it gets answered within the promised 2 working days.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { serviceWrite } from "./supabase-service.server";

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;

const Lead = z.object({
  name: z.string().trim().min(2).max(120),
  business: z.string().trim().min(2).max(160),
  town: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(40).optional().default(""),
  // Hidden field. People leave it empty; bots fill it in.
  website: z.string().max(200).optional().default(""),
  // The Google listing the person confirmed, when they picked one.
  place: z
    .object({
      placeId: z.string().regex(PLACE_ID_RE),
      address: z.string().max(300).optional().default(""),
      rating: z.number().min(0).max(5).nullable().optional(),
      reviewCount: z.number().int().min(0).max(10_000_000).nullable().optional(),
      websiteUrl: z.string().max(300).optional().default(""),
      mapsUrl: z.string().max(500).optional().default(""),
    })
    .nullable()
    .optional(),
});

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Best effort: a failed email never loses the request (it is already saved).
async function notifyNewLead(
  lead: z.output<typeof Lead>,
  reportLink: string | null,
): Promise<void> {
  const key = (process.env["REPSUITES_RESEND_API_KEY"] ?? "").trim();
  if (!key) return;
  const to = (process.env["REPSUITES_LEADS_TO"] ?? "julius@accelur8.com").trim();
  const p = lead.place;
  const rows: [string, string][] = [
    ["Name", lead.name],
    ["Business", lead.business],
    ["Town", lead.town],
    ["Email", lead.email],
    ["Phone", lead.phone || "-"],
    ["Google listing", p ? p.address || "picked" : "not picked"],
    ["Rating", p && p.rating != null ? `${p.rating} (${p.reviewCount ?? 0} reviews)` : "-"],
    ["Website", p?.websiteUrl || "-"],
    ["Maps link", p?.mapsUrl || "-"],
    ["Draft report", reportLink ?? "not built (no Google listing picked)"],
  ];
  const html =
    `<p>New free visibility check request on repsuites.com.</p><table>` +
    rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("") +
    `</table><p>Promised reply: within 2 working days. Check the draft report, then send it from Prospects on repsuites.com.</p>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "RepSuites <noreply@repsuites.com>",
        to: [to],
        reply_to: lead.email,
        subject: `Visibility check request: ${lead.business} (${lead.town})`,
        html,
      }),
    });
  } catch {
    // ignore: the lead is saved
  }
}

export const requestVisibilityCheck = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof Lead>) => Lead.parse(data))
  .handler(async ({ data }) => {
    if (data.website) return { ok: true as const };
    const p = data.place ?? null;
    const w = await serviceWrite<{ id: string }[]>("leads", "", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        name: data.name,
        business_name: data.business,
        town: data.town,
        email: data.email.toLowerCase(),
        phone: data.phone || null,
        source: "homepage_visibility_check",
        google_place_id: p?.placeId ?? null,
        address: p?.address || null,
        google_rating: p?.rating ?? null,
        google_review_count: p?.reviewCount ?? null,
        website_url: p?.websiteUrl || null,
      },
    });
    if (w.error)
      return { ok: false as const, error: "Sorry, that did not send. Please try again." };
    // Turn a request with a Google listing into a prospect with a ready report.
    let reportLink: string | null = null;
    let prospectId: string | null = null;
    if (p?.placeId) {
      const { saveProspectReport } = await import("./prospects.server");
      const r = await saveProspectReport(p.placeId, "inbound", {
        email: data.email.toLowerCase(),
        contactName: data.name,
        // One Accelur8 HQ call for this request: lead_captured below.
        hq: false,
      }).catch(() => null);
      if (r?.ok) {
        reportLink = `https://repsuites.com/r/${r.token}`;
        prospectId = r.prospectId ?? null;
      }
    }
    const leadId = w.data?.[0]?.id ?? null;
    const { hqAfter } = await import("./hq.server");
    await Promise.all([
      notifyNewLead(data, reportLink),
      // Accelur8 HQ: a new inbound lead. Never fails the request.
      hqAfter(() =>
        leadId
          ? {
              event: "lead_captured",
              idempotency_key: `lead:${leadId}`,
              contact: {
                email: data.email.toLowerCase(),
                phone: data.phone || null,
                name: data.name,
                role: "owner",
              },
              company: {
                name: data.business,
                town: data.town,
                website: p?.websiteUrl || null,
              },
              ...(prospectId
                ? { product_link: { type: "prospect" as const, id: prospectId } }
                : {}),
              data: {
                source: "homepage_visibility_check",
                lead_id: leadId,
                ...(reportLink ? { report_url: reportLink } : {}),
                ...(p?.placeId ? { place_id: p.placeId } : {}),
              },
            }
          : null,
      ),
    ]);
    return { ok: true as const };
  });
