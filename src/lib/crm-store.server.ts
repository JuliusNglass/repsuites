/* eslint-disable @typescript-eslint/no-explicit-any -- GHL-shaped JSON, checked field by field. */
// Server-only: Accelur8's contact book lives in SparkOps (leads). RepSuites
// keeps no contacts of its own. crmFetch() answers the handful of GHL calls
// the funnel code makes, in GHL's own JSON shape, by calling SparkOps'
// intake endpoint (crm_* events, server to server):
//   POST /contacts/upsert, POST /contacts/search (tag filter),
//   GET /contacts/{id}, POST /contacts/{id}/tags, POST /contacts/{id}/notes,
//   GET /contacts/{id}/appointments and GET /calendars/events (empty: Fit
//   Calls book in SparkOps, which tags the lead "grw-booked" itself).
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { HQ_DEFAULT_URL } from "./hq.server";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const plus = (p: unknown) => {
  const d = String(p ?? "").replace(/[^\d+]/g, "");
  if (!d) return null;
  if (d.startsWith("+")) return d;
  if (/^07\d{9}$/.test(d)) return `+44${d.slice(1)}`;
  if (/^44\d{10}$/.test(d)) return `+${d}`;
  return d;
};

/** One call to SparkOps' Accelur8 contact book. */
export async function sparkopsCrm(
  body: Record<string, unknown>,
): Promise<{ status: number; data: any }> {
  try {
    const url = (process.env["HQ_CRM_URL"] ?? "").trim() || HQ_DEFAULT_URL;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  } catch {
    return { status: 503, data: {} };
  }
}

/** GHL-shaped stand-in for fetch("https://services.leadconnectorhq.com" + path). */
export async function crmFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? (JSON.parse(init.body) as any) : {};
  const parts = new URL(path, "https://x").pathname.split("/").filter(Boolean);
  if (parts[0] === "calendars") return json(200, { events: [] });
  if (parts[0] === "opportunities" && method === "POST") {
    const r = await sparkopsCrm({
      event: "crm_sale",
      id: body.contactId,
      value: body.monetaryValue,
      name: body.name,
    });
    return json(r.status, r.data);
  }
  if (parts[0] !== "contacts") return json(404, { message: "not supported" });

  if (method === "POST" && parts[1] === "upsert") {
    const answers: Record<string, unknown> = {};
    for (const f of body.customFields ?? []) if (f?.id) answers[f.id] = f.field_value ?? f.value;
    const r = await sparkopsCrm({
      event: "crm_upsert",
      contact: { ...body, phone: plus(body.phone) },
      answers,
    });
    return json(r.status, r.data);
  }
  if (method === "GET" && parts[1] === "search" && parts[2] === "duplicate") {
    const q = new URL(path, "https://x").searchParams;
    const r = await sparkopsCrm({ event: "crm_find", email: q.get("email"), phone: q.get("number") });
    return json(r.status, r.data);
  }
  if (method === "POST" && parts[1] === "search") {
    const tag = (body.filters ?? []).find((f: any) => f?.field === "tags")?.value;
    const r = await sparkopsCrm({
      event: "crm_search",
      tag: tag ?? "",
      limit: body.pageLimit ?? 100,
    });
    return json(r.status, r.data);
  }
  const id = parts[1] ?? "";
  if (!id) return json(404, {});
  if (method === "GET" && parts.length === 2) {
    const r = await sparkopsCrm({ event: "crm_get", id });
    return json(r.status, r.data);
  }
  if (method === "GET" && parts[2] === "appointments") return json(200, { events: [] });
  if (method === "GET" && parts[2] === "notes") {
    const r = await sparkopsCrm({ event: "crm_notes", id });
    return json(r.status, r.data);
  }
  if (method === "PUT" && parts.length === 2) {
    const answers: Record<string, unknown> = {};
    for (const f of body.customFields ?? []) if (f?.id) answers[f.id] = f.field_value ?? f.value;
    const r = await sparkopsCrm({ event: "crm_update", id, answers });
    return json(r.status, r.data);
  }
  if (method === "POST" && parts[2] === "tasks") {
    const r = await sparkopsCrm({
      event: "crm_note",
      id,
      body: `Task: ${body.title ?? ""}${body.body ? `\n${body.body}` : ""}${body.dueDate ? `\nDue: ${body.dueDate}` : ""}`,
    });
    return json(r.status, r.data);
  }
  if (method === "POST" && parts[2] === "tags") {
    const r = await sparkopsCrm({ event: "crm_tags", id, tags: body.tags ?? [] });
    return json(r.status, r.data);
  }
  if (method === "DELETE" && parts[2] === "tags") return json(200, {});
  if (method === "POST" && parts[2] === "notes") {
    const r = await sparkopsCrm({ event: "crm_note", id, body: body.body ?? "" });
    return json(r.status, r.data);
  }
  return json(404, { message: "not supported" });
}

/**
 * One-off: copy GHL contacts (with tags and custom fields, GHL ids kept) into
 * SparkOps leads, 100 per run, resuming from a saved cursor. Existing rows are
 * merged in one call (tags unioned), so it is safe to run while the funnel keeps writing.
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
  const rows = list.map((c) => {
    const answers: Record<string, unknown> = {};
    for (const f of c.customFields ?? []) if (f?.id) answers[f.id] = f.value;
    return {
      external_id: String(c.id),
      name: [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
      email: c.email ? String(c.email).toLowerCase() : null,
      phone: plus(c.phone),
      company: c.companyName ?? null,
      source: c.source ?? "GHL",
      answers,
      created_at: c.dateAdded ?? null,
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
    };
  });
  // One request for the whole page (Workers limit outside calls per run).
  if (rows.length) {
    const w = await sparkopsCrm({ event: "crm_merge", rows });
    if (w.status !== 200) return 0;
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
