/* eslint-disable @typescript-eslint/no-explicit-any -- GHL-shaped JSON, checked field by field. */
// Server-only: Accelur8's own contact store (crm_contacts), standing in for
// the GHL contacts API so GHL can be closed. crmFetch() answers the handful of
// GHL calls the funnel code makes, in GHL's own JSON shape, so callers only
// swap which function they call:
//   POST /contacts/upsert, POST /contacts/search (tag filter),
//   GET /contacts/{id}, POST /contacts/{id}/tags, POST /contacts/{id}/notes,
//   GET /contacts/{id}/appointments and GET /calendars/events (empty: Fit
//   Calls now book in SparkOps, which tags the contact "grw-booked").
import { serviceRead, serviceWrite } from "./supabase-service.server";

type Row = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  tags: string[];
  custom: Record<string, unknown>;
  dnd: boolean;
  date_added: string;
};

const SEL = "id,first_name,last_name,email,phone,company,source,tags,custom,dnd,date_added";

export function toContact(r: Row) {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    companyName: r.company,
    source: r.source,
    tags: r.tags ?? [],
    dnd: r.dnd,
    dateAdded: r.date_added,
    customFields: Object.entries(r.custom ?? {}).map(([id, value]) => ({ id, value })),
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const enc = encodeURIComponent;
const plus = (p: unknown) => {
  const d = String(p ?? "").replace(/[^\d+]/g, "");
  if (!d) return null;
  if (d.startsWith("+")) return d;
  if (/^07\d{9}$/.test(d)) return `+44${d.slice(1)}`;
  if (/^44\d{10}$/.test(d)) return `+${d}`;
  return d;
};

export async function findContact(
  email?: string | null,
  phone?: string | null,
): Promise<Row | null> {
  if (email) {
    const r = await serviceRead<Row[]>(
      `crm_contacts?select=${SEL}&email=ilike.${enc(email.trim())}&limit=1`,
      "",
    );
    if (r.data?.[0]) return r.data[0];
  }
  const p = plus(phone);
  if (p) {
    const r = await serviceRead<Row[]>(`crm_contacts?select=${SEL}&phone=eq.${enc(p)}&limit=1`, "");
    if (r.data?.[0]) return r.data[0];
  }
  return null;
}

export async function addTags(id: string, tags: string[]): Promise<boolean> {
  const r = await serviceWrite<string[]>("rpc/crm_add_tags", "", {
    method: "POST",
    body: { p_id: id, p_tags: tags },
  });
  return !r.error;
}

/** GHL-shaped stand-in for fetch("https://services.leadconnectorhq.com" + path). */
export async function crmFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? (JSON.parse(init.body) as any) : {};
  const u = new URL(path, "https://x");
  const parts = u.pathname.split("/").filter(Boolean);

  if (parts[0] === "calendars") return json(200, { events: [] });
  if (parts[0] !== "contacts") return json(404, { message: "not supported" });

  if (method === "POST" && parts[1] === "upsert") {
    const existing = await findContact(body.email, body.phone);
    const custom: Record<string, unknown> = { ...(existing?.custom ?? {}) };
    for (const f of body.customFields ?? []) if (f?.id) custom[f.id] = f.field_value ?? f.value;
    const row = {
      first_name: body.firstName ?? existing?.first_name ?? null,
      last_name: body.lastName ?? existing?.last_name ?? null,
      email: body.email ? String(body.email).toLowerCase() : (existing?.email ?? null),
      phone: plus(body.phone) ?? existing?.phone ?? null,
      company: body.companyName ?? existing?.company ?? null,
      source: existing?.source ?? body.source ?? null,
      custom,
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      const w = await serviceWrite(`crm_contacts?id=eq.${enc(existing.id)}`, "", {
        method: "PATCH",
        body: row,
      });
      return w.error ? json(500, {}) : json(200, { contact: { id: existing.id } });
    }
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const w = await serviceWrite("crm_contacts", "", {
      method: "POST",
      body: { id, ...row, tags: body.tags ?? [] },
    });
    return w.error ? json(500, {}) : json(200, { contact: { id }, new: true });
  }

  if (method === "POST" && parts[1] === "search") {
    const tag = (body.filters ?? []).find((f: any) => f?.field === "tags")?.value;
    const lim = Math.min(Number(body.pageLimit) || 100, 500);
    const q = tag
      ? `crm_contacts?select=${SEL}&tags=cs.${enc(`{"${String(tag).replace(/"/g, "")}"}`)}&order=date_added.desc&limit=${lim}`
      : `crm_contacts?select=${SEL}&order=date_added.desc&limit=${lim}`;
    const r = await serviceRead<Row[]>(q, "");
    if (r.error) return json(500, {});
    return json(200, { contacts: (r.data ?? []).map(toContact) });
  }

  const id = parts[1] ?? "";
  if (!id) return json(404, {});
  if (method === "GET" && parts.length === 2) {
    const r = await serviceRead<Row[]>(`crm_contacts?select=${SEL}&id=eq.${enc(id)}`, "");
    return r.data?.[0] ? json(200, { contact: toContact(r.data[0]) }) : json(404, {});
  }
  if (method === "GET" && parts[2] === "appointments") return json(200, { events: [] });
  if (method === "POST" && parts[2] === "tags") {
    return (await addTags(id, Array.isArray(body.tags) ? body.tags.map(String) : []))
      ? json(201, { tags: body.tags })
      : json(500, {});
  }
  if (method === "DELETE" && parts[2] === "tags") return json(200, {});
  if (method === "POST" && parts[2] === "notes") {
    const w = await serviceWrite("crm_notes", "", {
      method: "POST",
      body: { contact_id: id, body: String(body.body ?? "").slice(0, 5000) },
    });
    return w.error ? json(500, {}) : json(201, {});
  }
  return json(404, { message: "not supported" });
}

/**
 * One-off: copy GHL contacts (with tags and custom fields, GHL ids kept) into
 * crm_contacts, 100 per run, resuming from a saved cursor. Existing rows are
 * merged (tags unioned), so it is safe to run while the funnel keeps writing.
 */
export async function backfillFromGhl(): Promise<number> {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token) return 0;
  const st = await serviceRead<{ cursor: unknown; done: boolean; copied: number }[]>(
    "crm_backfill?select=cursor,done,copied&id=eq.1",
    "",
  );
  if (st.error || st.data?.[0]?.done) return 0;
  const cursor = st.data?.[0]?.cursor ?? null;
  const r = await fetch("https://services.leadconnectorhq.com/contacts/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      locationId: "HzEU9UBWZEzxuB5SSDYE",
      pageLimit: 100,
      sort: [{ field: "dateAdded", direction: "desc" }],
      ...(cursor ? { searchAfter: cursor } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!r?.ok) return 0;
  const list = (((await r.json()) as any).contacts ?? []) as any[];
  for (const c of list) {
    const custom: Record<string, unknown> = {};
    for (const f of c.customFields ?? []) if (f?.id) custom[f.id] = f.value;
    const row = {
      id: String(c.id),
      first_name: c.firstName ?? null,
      last_name: c.lastName ?? null,
      email: c.email ? String(c.email).toLowerCase() : null,
      phone: plus(c.phone),
      company: c.companyName ?? null,
      source: c.source ?? null,
      custom,
      dnd: !!c.dnd,
      date_added: c.dateAdded ?? new Date().toISOString(),
    };
    await serviceWrite("crm_contacts?on_conflict=id", "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: row,
    });
    if (Array.isArray(c.tags) && c.tags.length) await addTags(row.id, c.tags.map(String));
  }
  const last = list[list.length - 1]?.searchAfter ?? null;
  await serviceWrite("crm_backfill?on_conflict=id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      id: 1,
      cursor: last ?? cursor,
      done: list.length < 100,
      copied: (st.data?.[0]?.copied ?? 0) + list.length,
      updated_at: new Date().toISOString(),
    },
  });
  return list.length;
}
