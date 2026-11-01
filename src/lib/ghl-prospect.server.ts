import { ghlProspectPayload, type GhlProspectInput } from "./ghl-prospect";

// Accelur8 Ltd sub-account, workflow "Prospect follow-up (WhatsApp contacted)".
const DEFAULT_URL =
  "https://services.leadconnectorhq.com/hooks/HzEU9UBWZEzxuB5SSDYE/webhook-trigger/sidfYiEU9hJ32b4FBL5i";

// Best effort: a failure here must never stop the prospect being marked sent.
export async function pushProspectToGhl(p: GhlProspectInput, via: string): Promise<boolean> {
  const url = process.env["GHL_PROSPECT_WEBHOOK_URL"] || DEFAULT_URL;
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
