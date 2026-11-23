// Call sheet server functions (Accelur8 team only). Reads and writes GHL.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GHL_LOCATION_ID } from "./ghl-lead";
import { agencyGuard } from "./prospects.server";
import { breakEvenContracts, FIELDS } from "./call-sheet";
import { FIT_CALL_CALENDAR, safeMeet } from "./growth-join";

const ID = z.string().regex(/^[A-Za-z0-9]{10,40}$/);
const PRODUCT = "6b03eddbcc1449eec1e443a3";
const PRICE_FULL = "6b03ede29c22a0569a5bffb7";
const PRICE_PLAN = "6b03ede2a066ead3be650e50";
const USER_ID = "gaVnE5zfNEw6S4hntJmA";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function ghl(path: string, init: RequestInit = {}) {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token) return null;
  try {
    const r = await fetch(`https://services.leadconnectorhq.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    return { ok: r.ok, status: r.status, json: (await r.json().catch(() => ({}))) as Json };
  } catch {
    return null;
  }
}

export const loadCallContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: ID }).parse(d))
  .handler(async ({ data }) => {
    const g = await agencyGuard(false);
    if (!g.ok) return { ok: false as const, error: g.error };
    const [c, n, a] = await Promise.all([
      ghl(`/contacts/${data.id}`),
      ghl(`/contacts/${data.id}/notes`),
      ghl(`/contacts/${data.id}/appointments`),
    ]);
    type Ev = { startTime?: string; deleted?: boolean; calendarId?: string; address?: string };
    const toMs = (t: string) =>
      new Date(t.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? "" : "Z")).getTime();
    const now = Date.now();
    const call = ((a?.json.events ?? []) as Ev[])
      .filter((e) => !e.deleted && e.calendarId === FIT_CALL_CALENDAR && e.startTime)
      .map((e) => ({ start: toMs(e.startTime!), meet: safeMeet(e.address) }))
      .filter((e) => e.start > now - 2 * 3_600_000)
      .sort((x, y) => x.start - y.start)[0];
    if (!c?.ok) return { ok: false as const, error: "Contact not found." };
    const k = c.json.contact ?? {};
    const custom: Record<string, string> = {};
    for (const f of k.customFields ?? []) custom[f.id] = String(f.value ?? "");
    const notes = ((n?.json.notes ?? []) as { body?: string; dateAdded?: string }[])
      .map((x) => ({ body: x.body ?? "", date: x.dateAdded ?? "" }))
      .slice(0, 8);
    return {
      ok: true as const,
      contact: {
        id: k.id as string,
        name: [k.firstName, k.lastName].filter(Boolean).join(" ") || k.contactName || "",
        firstName: (k.firstName as string) ?? "",
        company: (k.companyName as string) ?? "",
        email: (k.email as string) ?? "",
        phone: (k.phone as string) ?? "",
        tags: (k.tags as string[]) ?? [],
      },
      custom,
      notes,
      call: call ? { start: new Date(call.start).toISOString(), meet: call.meet } : null,
    };
  });

const Save = z.object({
  id: ID,
  weekly: z.number().min(0).max(100000),
  margin: z.number().min(0).max(100),
  commercialNow: z.number().min(0).max(1000000),
  blocker: z.string().max(500),
  decisionMaker: z.string().max(200),
  outcome: z.string().max(100),
  objection: z.string().max(100),
  recording: z
    .string()
    .max(500)
    .refine((s) => !s || s.startsWith("https://"), "Link must start with https://"),
  howWin: z.string().max(500),
  notes: z.string().max(4000),
});

export const saveCall = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Save.parse(d))
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return { ok: false as const, error: g.error };
    const be = breakEvenContracts(data.weekly, data.margin);
    const customFields = [
      { id: FIELDS.weekly, field_value: String(data.weekly || "") },
      { id: FIELDS.margin, field_value: String(data.margin || "") },
      { id: FIELDS.commercialNow, field_value: String(data.commercialNow || "") },
      { id: FIELDS.blocker, field_value: data.blocker },
      { id: FIELDS.decisionMaker, field_value: data.decisionMaker },
      { id: FIELDS.outcome, field_value: data.outcome },
      { id: FIELDS.objection, field_value: data.objection },
      { id: FIELDS.breakEven, field_value: be == null ? "" : String(be) },
      { id: FIELDS.recording, field_value: data.recording },
      { id: FIELDS.howWin, field_value: data.howWin },
    ];
    const u = await ghl(`/contacts/${data.id}`, {
      method: "PUT",
      body: JSON.stringify({ customFields }),
    });
    if (!u?.ok) return { ok: false as const, error: "Could not save to GHL." };
    const body = [
      `Fit call notes`,
      `Outcome: ${data.outcome || "-"} | Objection: ${data.objection || "-"}`,
      `Typical clean £${data.weekly}/week at ${data.margin}% margin. Break-even: ${be ?? "-"} contracts.`,
      `Commercial income now: £${data.commercialNow}/week. Decision maker: ${data.decisionMaker || "-"}`,
      `Main blocker: ${data.blocker || "-"}`,
      `How they win work: ${data.howWin || "-"}`,
      data.recording ? `Recording: ${data.recording}` : "",
      data.notes ? `Notes: ${data.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await ghl(`/contacts/${data.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body, userId: USER_ID }),
    });
    return { ok: true as const, breakEven: be };
  });

export const createLaunchInvoice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: ID, plan: z.enum(["full", "monthly"]) }).parse(d))
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return { ok: false as const, error: g.error };
    const c = await ghl(`/contacts/${data.id}`);
    if (!c?.ok) return { ok: false as const, error: "Contact not found." };
    const k = c.json.contact ?? {};
    const today = new Date().toISOString().slice(0, 10);
    const monthly = data.plan === "monthly";
    const body: Record<string, unknown> = {
      altId: GHL_LOCATION_ID,
      altType: "location",
      name: "Commercial Launch (3 months)",
      title: "INVOICE",
      currency: "GBP",
      items: [
        {
          name: "Commercial Launch (3 months)",
          description: monthly
            ? "3 monthly payments of £700. Includes £900 of ads and SparkOps for the 3 months."
            : "Includes £900 of ads and SparkOps for the 3 months.",
          productId: PRODUCT,
          priceId: monthly ? PRICE_PLAN : PRICE_FULL,
          currency: "GBP",
          amount: monthly ? 2100 : 2000,
          qty: 1,
          type: "one_time",
        },
      ],
      contactDetails: {
        id: k.id,
        name: [k.firstName, k.lastName].filter(Boolean).join(" ") || k.contactName || "",
        phoneNo: k.phone ?? "",
        email: k.email ?? "",
        companyName: k.companyName ?? "",
      },
      issueDate: today,
      dueDate: today,
      sentTo: { email: k.email ? [k.email] : [], phoneNo: k.phone ? [k.phone] : [] },
      liveMode: true,
      action: "draft",
      userId: USER_ID,
    };
    if (monthly) {
      const last = new Date();
      last.setMonth(last.getMonth() + 2);
      body["dueDate"] = last.toISOString().slice(0, 10);
      body["paymentSchedule"] = {
        type: "fixed",
        schedules: [0, 1, 2].map((m) => {
          const d = new Date();
          d.setMonth(d.getMonth() + m);
          return { value: 700, valueType: "fixed", dueDate: d.toISOString().slice(0, 10) };
        }),
      };
    }
    const r = await ghl(`/invoices/text2pay`, { method: "POST", body: JSON.stringify(body) });
    if (!r?.ok || !r.json.invoiceUrl)
      return { ok: false as const, error: `Invoice failed (${r?.status ?? "no reply"}).` };
    return {
      ok: true as const,
      url: r.json.invoiceUrl as string,
      number: r.json.invoice?.invoiceNumber as string,
    };
  });
