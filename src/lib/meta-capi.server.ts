// Meta Conversions API (server side). Sends the same Lead / Purchase as the
// browser Pixel, with the same event_id, so ad blockers don't hide results.
// Needs the META_CAPI_TOKEN secret; does nothing without it.
import { META_PIXEL_ID } from "./meta-pixel";

async function sha256(v: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// UK numbers to digits with country code, e.g. 07700 900123 -> 447700900123.
export function normalisePhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.startsWith("44")) return d;
  if (d.startsWith("0")) return "44" + d.slice(1);
  return d;
}

export async function sendMetaEvent(e: {
  name: "Lead" | "Purchase";
  eventId: string;
  url: string;
  email?: string | null;
  phone?: string | null;
  value?: number;
}): Promise<void> {
  const token = (process.env["META_CAPI_TOKEN"] ?? "").trim();
  if (!META_PIXEL_ID || !token) return;
  const user_data: Record<string, string[]> = {};
  if (e.email) user_data["em"] = [await sha256(e.email.trim().toLowerCase())];
  if (e.phone) user_data["ph"] = [await sha256(normalisePhone(e.phone))];
  const body = {
    data: [
      {
        event_name: e.name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: e.eventId,
        action_source: "website",
        event_source_url: e.url,
        user_data,
        ...(e.value != null ? { custom_data: { currency: "GBP", value: e.value } } : {}),
      },
    ],
  };
  try {
    await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Tracking must never break a sign-up or a sale.
  }
}
