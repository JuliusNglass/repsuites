import { crmFetch } from "./crm-store.server";
import { ghlProspectPayload, ghlProspectUrl, type GhlProspectInput } from "./ghl-prospect";

// Best effort: a failure here must never stop the prospect being marked sent.
// Now records the prospect as a SparkOps contact (tag prospect-contacted)
// instead of firing the GHL webhook. GHL_PROSPECT_WEBHOOK_URL=off still skips.
export async function pushProspectToGhl(p: GhlProspectInput, via: string): Promise<boolean> {
  if (!ghlProspectUrl(process.env["GHL_PROSPECT_WEBHOOK_URL"])) return false;
  if (!p.phone && !p.email) return false;
  const d = ghlProspectPayload(p, via, new Date());
  try {
    const r = await crmFetch("/contacts/upsert", {
      method: "POST",
      body: JSON.stringify({
        firstName: d.first_name,
        lastName: d.last_name,
        companyName: d.business_name,
        phone: d.phone || undefined,
        email: d.email || undefined,
        source: `prospect-${d.contacted_via}`,
        tags: ["prospect-contacted", d.product],
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
