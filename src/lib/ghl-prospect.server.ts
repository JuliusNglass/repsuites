import { ghlProspectPayload, ghlProspectUrl, type GhlProspectInput } from "./ghl-prospect";

// Best effort: a failure here must never stop the prospect being marked sent.
// Skips quietly when GHL is switched off (GHL_PROSPECT_WEBHOOK_URL=off) or
// the address is not a valid https link. Accelur8 HQ gets prospect_sent anyway.
export async function pushProspectToGhl(p: GhlProspectInput, via: string): Promise<boolean> {
  const url = ghlProspectUrl(process.env["GHL_PROSPECT_WEBHOOK_URL"]);
  if (!url) return false;
  if (!p.phone && !p.email) return false;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ghlProspectPayload(p, via, new Date())),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
