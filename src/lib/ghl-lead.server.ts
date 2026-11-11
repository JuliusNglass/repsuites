import { ghlLeadBody, GHL_LOCATION_ID, type GhlLeadInput } from "./ghl-lead";

// Best effort: a failure here must never lose the lead (it is already saved
// in Supabase). Needs GHL_PRIVATE_TOKEN (a private integration token for the
// Accelur8 Ltd sub-account with contacts.write). Without it, skips quietly.
export async function pushLeadToGhl(p: GhlLeadInput): Promise<boolean> {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token) return false;
  if (!p.email && !p.phone) return false;
  try {
    const r = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(ghlLeadBody(p)),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) console.error("GHL lead upsert failed", r.status);
    return r.ok;
  } catch {
    return false;
  }
}

// A paid Fix-It Pack: tag the contact so GHL stops the sales follow-ups
// ("customer") and starts delivery ("fixit-paid"). Best effort, like above.
export async function tagFixitPaid(p: {
  email: string | null;
  phone: string | null;
  name: string | null;
  business: string | null;
}): Promise<boolean> {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token || (!p.email && !p.phone)) return false;
  const [firstName, ...rest] = String(p.name ?? "")
    .trim()
    .split(/\s+/);
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
        ...(p.email ? { email: p.email } : {}),
        ...(p.phone ? { phone: p.phone } : {}),
        ...(firstName ? { firstName } : {}),
        ...(rest.length ? { lastName: rest.join(" ") } : {}),
        ...(p.business ? { companyName: p.business } : {}),
        tags: ["customer", "fixit-paid"],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) console.error("GHL fixit tag failed", r.status);
    return r.ok;
  } catch {
    return false;
  }
}
