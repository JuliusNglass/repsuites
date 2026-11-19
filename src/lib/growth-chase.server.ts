// Growth Fit Call chase: runs every 10 minutes (database cron). Finds qualified
// growth leads in GHL who have not booked and sends the next due text.
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { GHL_LOCATION_ID } from "./ghl-lead";
import { inSendWindow } from "./check-followups";
import { bookLink, chaseDue, chaseSms, CHASE_MAX_HOURS, CHASE_STOP_TAGS } from "./growth-chase";

type Contact = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  dnd?: boolean;
  dateAdded?: string;
};

async function ghl(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token) return null;
  try {
    return await fetch(`https://services.leadconnectorhq.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
}

async function qualifiedLeads(): Promise<Contact[]> {
  const r = await ghl("/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      locationId: GHL_LOCATION_ID,
      pageLimit: 100,
      filters: [{ field: "tags", operator: "contains", value: "grw-lead" }],
      sort: [{ field: "dateAdded", direction: "desc" }],
    }),
  });
  if (!r?.ok) {
    console.error("growth chase: GHL search failed", r?.status);
    return [];
  }
  const cutoff = Date.now() - CHASE_MAX_HOURS * 3_600_000;
  return (((await r.json()) as { contacts?: Contact[] }).contacts ?? []).filter(
    (c) =>
      c.dateAdded &&
      new Date(c.dateAdded).getTime() >= cutoff &&
      (c.tags ?? []).some((t) => t === "qualified" || t === "grw-warm"),
  );
}

export async function runGrowthChase(token: string) {
  const ok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
    method: "POST",
    body: { p_token: token },
  });
  if (ok.error || ok.data !== true) return { status: 401, body: { ok: false } };
  const now = new Date();
  if (!inSendWindow(now)) return { status: 200, body: { ok: true, skipped: "outside hours" } };

  const leads = await qualifiedLeads();
  if (!leads.length) return { status: 200, body: { ok: true, sent: 0 } };
  const ids = leads.map((c) => `"${c.id.replace(/"/g, "")}"`).join(",");
  const done = await serviceRead<{ contact_id: string; step: number }[]>(
    `growth_chase?select=contact_id,step&contact_id=in.(${encodeURIComponent(ids)})`,
    "",
  );
  if (done.error) return { status: 500, body: { ok: false } };
  const doneBy = new Map<string, number[]>();
  for (const d of done.data ?? [])
    doneBy.set(d.contact_id, [...(doneBy.get(d.contact_id) ?? []), d.step]);

  let sent = 0;
  for (const c of leads) {
    if (!c.phone || c.dnd || (c.tags ?? []).some((t) => CHASE_STOP_TAGS.includes(t))) continue;
    const step = chaseDue(c.dateAdded ?? "", doneBy.get(c.id) ?? [], now);
    if (!step) continue;
    const r = await ghl("/conversations/messages", {
      method: "POST",
      body: JSON.stringify({
        type: "SMS",
        contactId: c.id,
        message: chaseSms(step, c.firstName, bookLink(c)),
      }),
    });
    const status = r?.ok ? "sent" : "failed";
    if (!r?.ok) console.error("growth chase: SMS failed", r?.status);
    await serviceWrite("growth_chase", "", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: { contact_id: c.id, step, status },
    });
    if (r?.ok) sent++;
    // After the last text, hand them to the long nurture (never dropped).
    if (r?.ok && step === 3)
      await ghl(`/contacts/${c.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: ["grw-nobook", "nurture"] }),
      });
  }
  return { status: 200, body: { ok: true, sent } };
}
