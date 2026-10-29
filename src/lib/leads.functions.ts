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
async function notifyNewLead(lead: z.output<typeof Lead>): Promise<void> {
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
  ];
  const html =
    `<p>New free visibility check request on repsuites.com.</p><table>` +
    rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("") +
    `</table><p>Promised reply: within 2 working days.</p>`;
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
    const w = await serviceWrite<unknown>("leads", "", {
      method: "POST",
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
    await notifyNewLead(data);
    return { ok: true as const };
  });
