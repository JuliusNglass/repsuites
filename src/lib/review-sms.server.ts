/* eslint-disable @typescript-eslint/no-explicit-any -- provider and PostgREST JSON is checked field by field. */
// Server-only: sends texted review requests through The SMS Works for
// businesses with the Text Pack. Needs SMSWORKS_API_KEY (the JWT) on the
// worker. Each text part is counted against the business's monthly
// allowance first and given back if the text does not go.
// No em dashes in this copy (AGENTS.md).
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { cleanSender, smsNumber, smsParts, smsPeriod } from "./review-sms";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function smsReady(): boolean {
  return env("SMSWORKS_API_KEY").length > 20;
}

function authForms(key: string): string[] {
  const bare = key.replace(/^(JWT|Bearer)\s+/i, "").trim();
  return /^JWT\s/i.test(key) ? [key, bare] : [bare, `JWT ${bare}`];
}

export async function sendSmsWorks(a: {
  to: string;
  sender: string;
  text: string;
  tag?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const key = env("SMSWORKS_API_KEY");
  if (!key) return { ok: false, error: "Texting is not switched on." };
  const to = smsNumber(a.to);
  if (!to) return { ok: false, error: "Not a UK mobile number." };
  const sender = cleanSender(a.sender);
  if (!sender) return { ok: false, error: "Sender name must be 3 to 11 letters or numbers." };
  const body = JSON.stringify({
    sender,
    destination: to,
    content: a.text.slice(0, 1280),
    ...(a.tag ? { tag: a.tag.replace(/[^A-Za-z0-9 ]/g, " ").slice(0, 280) } : {}),
  });
  try {
    let r: Response | null = null;
    let data: any = null;
    for (const auth of authForms(key)) {
      r = await fetch("https://api.thesmsworks.co.uk/v1/message/send", {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(15000),
      });
      data = await r.json().catch(() => null);
      if (r.status !== 401) break;
    }
    if (!r || !r.ok)
      return {
        ok: false,
        error: String(data?.message ?? `Text not sent (${r?.status ?? 0}).`).slice(0, 200),
      };
    return { ok: true, id: String(data?.messageid ?? data?.messageId ?? "") };
  } catch {
    return { ok: false, error: "Text service did not answer." };
  }
}

export interface TextPack {
  enabled: boolean;
  sender: string | null;
  monthlyCap: number;
}

export async function textPackFor(tenantId: string): Promise<TextPack | null> {
  const r = await serviceRead<any[]>(
    `review_sms_settings?select=enabled,sender,monthly_cap&tenant_id=eq.${tenantId}`,
    "",
  );
  const row = r.data?.[0];
  if (!row) return null;
  return {
    enabled: !!row.enabled,
    sender: cleanSender(row.sender),
    monthlyCap: Number(row.monthly_cap ?? 0),
  };
}

// Counts the parts against this month's allowance. False when it would go over.
export async function takeSmsParts(tenantId: string, parts: number, now: Date): Promise<boolean> {
  const r = await serviceWrite<boolean>("rpc/repsuites_use_sms", "", {
    method: "POST",
    body: { p_tenant: tenantId, p_period: smsPeriod(now), p_parts: parts },
  });
  return !r.error && r.data === true;
}

export async function giveBackSmsParts(tenantId: string, parts: number, now: Date) {
  await serviceWrite("rpc/repsuites_use_sms", "", {
    method: "POST",
    body: { p_tenant: tenantId, p_period: smsPeriod(now), p_parts: -parts },
  }).catch(() => null);
}

export { smsParts };
