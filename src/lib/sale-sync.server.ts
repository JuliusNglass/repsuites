// Won-deal sync: runs every 15 minutes (database cron). For each GHL opportunity
// newly marked won: send Meta a Purchase (so ads optimise for buyers), tag the
// contact "customer" (stops every chase), and push an in-app task to the owner.
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { GHL_LOCATION_ID } from "./ghl-lead";
import { sendMetaEvent } from "./meta-capi.server";
import { ALERT_USER_ID } from "./growth-lead";
import { isNewSale, saleTitle, type WonOpp } from "./sale-sync";

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

export async function runSaleSync(token: string) {
  const ok = await serviceWrite<boolean>("rpc/repsuites_cron_token_ok", "", {
    method: "POST",
    body: { p_token: token },
  });
  if (ok.error || ok.data !== true) return { status: 401, body: { ok: false } };

  const r = await ghl(
    `/opportunities/search?location_id=${GHL_LOCATION_ID}&status=won&limit=50&order=added_desc`,
  );
  if (!r?.ok) return { status: 502, body: { ok: false, error: `GHL ${r?.status ?? "down"}` } };
  const opps = (((await r.json()) as { opportunities?: WonOpp[] }).opportunities ?? []).filter(
    (o) => isNewSale(o),
  );
  if (!opps.length) return { status: 200, body: { ok: true, sales: 0 } };

  const ids = opps.map((o) => `"${o.id.replace(/"/g, "")}"`).join(",");
  const seen = await serviceRead<{ opportunity_id: string }[]>(
    `growth_sales?select=opportunity_id&opportunity_id=in.(${encodeURIComponent(ids)})`,
    "",
  );
  if (seen.error) return { status: 500, body: { ok: false } };
  const done = new Set((seen.data ?? []).map((s) => s.opportunity_id));

  let sales = 0;
  for (const o of opps) {
    if (done.has(o.id)) continue;
    // Claim the row first so a sale is never sent twice.
    const claim = await serviceWrite<{ opportunity_id: string }[]>("growth_sales", "", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: {
        opportunity_id: o.id,
        contact_id: o.contact!.id,
        value: Number(o.monetaryValue) || 0,
      },
    });
    if (claim.error || !claim.data?.length) continue;
    const cid = o.contact!.id!;
    const meta = await sendMetaEvent({
      name: "Purchase",
      eventId: `sale-${o.id}`,
      url: "https://growth.accelur8clientwork.com/",
      email: o.contact?.email ?? null,
      phone: o.contact?.phone ?? null,
      firstName: (o.contact?.name ?? "").split(/\s+/)[0] || null,
      value: Number(o.monetaryValue) || 0,
    });
    await ghl(`/contacts/${cid}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: ["customer"] }),
    });
    const task = await ghl(`/contacts/${cid}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: saleTitle(o),
        body: `Happy days. Deal "${o.name ?? ""}" marked won. Meta Purchase ${meta ? "sent" : "NOT sent"}. Next: book the onboarding.`,
        dueDate: new Date(Date.now() + 60 * 60_000).toISOString(),
        completed: false,
        assignedTo: ALERT_USER_ID,
      }),
    });
    await serviceWrite(`growth_sales?opportunity_id=eq.${encodeURIComponent(o.id)}`, "", {
      method: "PATCH",
      body: { meta_sent: meta, alerted: !!task?.ok },
    });
    sales++;
  }
  return { status: 200, body: { ok: true, sales } };
}
