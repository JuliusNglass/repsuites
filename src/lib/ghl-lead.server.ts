import { ghlLeadBody, type GhlLeadInput } from "./ghl-lead";

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
