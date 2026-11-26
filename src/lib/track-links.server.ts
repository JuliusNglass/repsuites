// Server-only: record a tracked-link click and tag the contact in GHL.
import { crmFetch } from "./crm-store.server";
import { serviceWrite } from "./supabase-service.server";
import { LINKS } from "./track-links";

async function ghl(path: string, init: RequestInit = {}) {
  return crmFetch(`${path}`, {
    ...init,
    headers: {
      Version: "2021-07-28",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);
}

/** Returns the contact's first name (for personalised pages), or null. */
export async function recordClick(code: string, contactId: string | null): Promise<string | null> {
  if (!(code in LINKS)) return null;
  await serviceWrite("link_clicks", "", {
    method: "POST",
    body: { code, contact_id: contactId },
  });
  if (!contactId) return null;
  const [, r] = await Promise.all([
    ghl(`/contacts/${contactId}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: [`clicked-${code}`, "nurture-engaged"] }),
    }),
    ghl(`/contacts/${contactId}`),
  ]);
  const j = r?.ok
    ? ((await r.json().catch(() => null)) as { contact?: { firstName?: string } } | null)
    : null;
  return j?.contact?.firstName ?? null;
}
