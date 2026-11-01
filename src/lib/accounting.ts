// Accounting connections (QuickBooks Online, Xero, FreeAgent): pure helpers.
// Webhook signature checks, reading webhook payloads, turning a paid invoice
// and its customer into a review request, the sync cursor and the
// per-request subrequest budget. Client-safe (Web Crypto only). No em dashes
// in copy.

export type Provider = "quickbooks" | "xero" | "freeagent";
export const PROVIDERS: Provider[] = ["quickbooks", "xero", "freeagent"];

export const PROVIDER_NAMES: Record<Provider, string> = {
  quickbooks: "QuickBooks Online",
  xero: "Xero",
  freeagent: "FreeAgent",
};

export function isProvider(s: unknown): s is Provider {
  return s === "quickbooks" || s === "xero" || s === "freeagent";
}

// ---------- signatures ----------

function b64(bytes: ArrayBuffer): string {
  let s = "";
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!);
  return btoa(s);
}

function b64decode(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function hmacSha256Base64(key: Uint8Array | string, message: string): Promise<string> {
  const raw = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const k = await crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
}

// Constant time for equal-length strings.
export function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// QuickBooks: header intuit-signature = base64(HMAC-SHA256(raw body, verifier token)).
export async function verifyQuickBooksSignature(
  rawBody: string,
  signature: string | null,
  verifierToken: string,
): Promise<boolean> {
  if (!signature || !verifierToken) return false;
  return sameString(await hmacSha256Base64(verifierToken, rawBody), signature.trim());
}

// Xero: header x-xero-signature = base64(HMAC-SHA256(raw body, webhook key)).
// Also used for the "intent to receive" check: 200 when it matches, 401 when not.
export async function verifyXeroSignature(
  rawBody: string,
  signature: string | null,
  webhookKey: string,
): Promise<boolean> {
  if (!signature || !webhookKey) return false;
  return sameString(await hmacSha256Base64(webhookKey, rawBody), signature.trim());
}

// Resend (Svix): svix-signature holds "v1,<base64>" entries (space separated);
// the signed text is "<svix-id>.<svix-timestamp>.<raw body>", keyed with the
// base64 part of the whsec_ secret. Timestamps older or newer than 5 minutes fail.
export async function verifySvixSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 300) return false;
  const key = b64decode(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  if (!key) return false;
  const expected = await hmacSha256Base64(key, `${id}.${timestamp}.${rawBody}`);
  return signature
    .split(" ")
    .map((p) => p.trim())
    .some((p) => p.startsWith("v1,") && sameString(p.slice(3), expected));
}

// ---------- webhook payloads (they only tell us which company to check) ----------

// QuickBooks sends either the older {eventNotifications:[{realmId, dataChangeEvent}]}
// or the CloudEvents list [{type:"qbo.invoice.updated.v1", intuitaccountid, intuitentityid}].
// Returns the company ids (realm ids) with an Invoice or Payment change.
export function quickBooksRealms(payload: unknown): string[] {
  const out = new Set<string>();
  const ok = (id: unknown) => typeof id === "string" && /^\d{1,30}$/.test(id);
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const notes = (payload as { eventNotifications?: unknown }).eventNotifications;
    if (Array.isArray(notes)) {
      for (const n of notes) {
        const realm = (n as { realmId?: unknown })?.realmId;
        const ents = (n as { dataChangeEvent?: { entities?: unknown } })?.dataChangeEvent?.entities;
        if (
          ok(realm) &&
          Array.isArray(ents) &&
          ents.some((e) => /^(invoice|payment)$/i.test(String((e as { name?: unknown })?.name)))
        )
          out.add(realm as string);
      }
    }
  }
  const events = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { events?: unknown })?.events)
      ? (payload as { events: unknown[] }).events
      : [];
  for (const e of events) {
    const o = (e ?? {}) as Record<string, unknown>;
    const type = String(o["type"] ?? o["eventType"] ?? "");
    const realm = o["intuitaccountid"] ?? o["intuitAccountId"];
    if (/^qbo\.(invoice|payment)\./i.test(type) && ok(String(realm ?? ""))) out.add(String(realm));
  }
  return [...out];
}

// Xero: {events:[{eventCategory:"INVOICE", tenantId, ...}]}. The "intent to
// receive" check sends an empty list.
export function xeroTenants(payload: unknown): string[] {
  const events = (payload as { events?: unknown })?.events;
  if (!Array.isArray(events)) return [];
  const out = new Set<string>();
  for (const e of events) {
    const o = (e ?? {}) as Record<string, unknown>;
    const t = String(o["tenantId"] ?? "");
    if (o["eventCategory"] === "INVOICE" && /^[0-9a-f-]{36}$/i.test(t)) out.add(t.toLowerCase());
  }
  return [...out];
}

// ---------- paid invoices -> people to ask ----------

export interface PaidInvoice {
  externalId: string; // provider:invoice id, so the same invoice never asks twice
  customerKey: string; // to look up the customer record
  updatedAt: string; // ISO, for the cursor
  fallbackName: string;
  fallbackEmail: string | null;
}

export interface Customer {
  name: string;
  email: string | null;
  phone: string | null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

function iso(v: unknown): string | null {
  const s = str(v);
  // Xero's .NET style dates: /Date(1573755038314+0000)/
  const m = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(s);
  const t = m ? Number(m[1]) : Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseProviderDate(v: unknown): string | null {
  return iso(v);
}

// QuickBooks Invoice: paid when the balance is 0 on a non-zero invoice.
export function quickBooksPaid(inv: unknown, realmId: string): PaidInvoice | null {
  const o = (inv ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const id = str(o["Id"]);
  const updated = iso(o["MetaData"]?.["LastUpdatedTime"]);
  if (!id || !updated) return null;
  if (num(o["Balance"]) !== 0 || !(num(o["TotalAmt"]) > 0)) return null;
  const cust = str(o["CustomerRef"]?.["value"]);
  if (!cust) return null;
  return {
    externalId: `quickbooks:${realmId}-${id}`,
    customerKey: cust,
    updatedAt: updated,
    fallbackName: str(o["CustomerRef"]?.["name"]),
    fallbackEmail: str(o["BillEmail"]?.["Address"]) || null,
  };
}

export function quickBooksCustomer(c: unknown): Customer {
  const o = (c ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const person = `${str(o["GivenName"])} ${str(o["FamilyName"])}`.trim();
  return {
    name: person || str(o["DisplayName"]) || str(o["CompanyName"]),
    email: str(o["PrimaryEmailAddr"]?.["Address"]) || null,
    phone:
      str(o["Mobile"]?.["FreeFormNumber"]) || str(o["PrimaryPhone"]?.["FreeFormNumber"]) || null,
  };
}

// Xero Invoice: a sales invoice (ACCREC) with status PAID.
export function xeroPaid(inv: unknown): PaidInvoice | null {
  const o = (inv ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const id = str(o["InvoiceID"]).toLowerCase();
  const updated = iso(o["UpdatedDateUTC"]);
  if (!/^[0-9a-f-]{36}$/.test(id) || !updated) return null;
  if (o["Type"] !== "ACCREC" || o["Status"] !== "PAID") return null;
  const cust = str(o["Contact"]?.["ContactID"]).toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(cust)) return null;
  return {
    externalId: `xero:${id}`,
    customerKey: cust,
    updatedAt: updated,
    fallbackName: str(o["Contact"]?.["Name"]),
    fallbackEmail: str(o["Contact"]?.["EmailAddress"]) || null,
  };
}

export function xeroCustomer(c: unknown): Customer {
  const o = (c ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const phones: any[] = Array.isArray(o["Phones"]) ? o["Phones"] : []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const pick = (type: string) => {
    const p = phones.find((x) => x?.PhoneType === type && str(x?.PhoneNumber));
    if (!p) return null;
    const cc = str(p.PhoneCountryCode).replace(/[^\d]/g, "");
    const local = `${str(p.PhoneAreaCode)}${str(p.PhoneNumber)}`.replace(/\s+/g, " ");
    return cc ? `+${cc} ${local.replace(/^0/, "")}` : local;
  };
  const person = `${str(o["FirstName"])} ${str(o["LastName"])}`.trim();
  return {
    name: person || str(o["Name"]),
    email: str(o["EmailAddress"]) || null,
    phone: pick("MOBILE") ?? pick("DEFAULT"),
  };
}

// FreeAgent Invoice: status "Paid".
export function freeAgentPaid(inv: unknown): PaidInvoice | null {
  const o = (inv ?? {}) as Record<string, unknown>;
  const m = /\/v2\/invoices\/(\d+)$/.exec(str(o["url"]));
  const updated = iso(o["updated_at"]);
  const contact = str(o["contact"]);
  if (
    !m ||
    !updated ||
    !/^https:\/\/api(\.sandbox)?\.freeagent\.com\/v2\/contacts\/\d+$/.test(contact)
  )
    return null;
  if (str(o["status"]).toLowerCase() !== "paid") return null;
  return {
    externalId: `freeagent:${m[1]}`,
    customerKey: contact,
    updatedAt: updated,
    fallbackName: "",
    fallbackEmail: null,
  };
}

export function freeAgentCustomer(c: unknown): Customer {
  const o = ((c as { contact?: unknown })?.contact ?? c ?? {}) as Record<string, unknown>;
  const person = `${str(o["first_name"])} ${str(o["last_name"])}`.trim();
  return {
    name: person || str(o["organisation_name"]),
    email: str(o["email"]) || null,
    phone: str(o["mobile"]) || str(o["phone_number"]) || null,
  };
}

// What goes into the review request queue. Null when there is no way to
// reach the customer.
export function invoiceToRequest(
  inv: PaidInvoice,
  customer: Customer | null,
): { name: string; email: string | null; phone: string | null; externalId: string } | null {
  const email = (customer?.email || inv.fallbackEmail || "").trim().toLowerCase();
  const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
  const rawPhone = (customer?.phone ?? "").trim();
  const phone = rawPhone.replace(/[^\d]/g, "").length >= 6 ? rawPhone.slice(0, 30) : null;
  if (!okEmail && !phone) return null;
  return {
    name: (customer?.name || inv.fallbackName || "").replace(/\s+/g, " ").trim().slice(0, 80),
    email: okEmail,
    phone,
    externalId: inv.externalId.slice(0, 200),
  };
}

// ---------- cursor ----------

// Invoices are read "changed since the cursor" (inclusive), oldest first.
// After handling the first `handled` of them, the cursor moves to the last
// handled change time. It never moves backwards or past `now`. When a run
// was capped but every handled invoice shares the cursor time (so it would
// not move), it steps on by one second so the sync cannot get stuck.
export function nextCursor(
  cursor: string,
  sortedUpdatedAts: string[],
  handled: number,
  capped: boolean,
  now: Date,
): string {
  const cur = Date.parse(cursor);
  if (handled <= 0 || !sortedUpdatedAts.length) return new Date(cur).toISOString();
  const last = Date.parse(sortedUpdatedAts[Math.min(handled, sortedUpdatedAts.length) - 1]!);
  let next = Math.max(cur, last);
  if (capped && next === cur) next = cur + 1000;
  return new Date(Math.min(next, now.getTime())).toISOString();
}

// Sorts oldest change first (stable).
export function oldestFirst<T extends { updatedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
}

// ---------- subrequest budget ----------

// Cloudflare's free plan allows 50 outgoing requests (database calls count)
// per incoming request. Work takes from a budget and stops when it runs low.
export class Budget {
  constructor(public left: number) {}
  can(n: number): boolean {
    return this.left >= n;
  }
  take(n = 1): boolean {
    if (this.left < n) return false;
    this.left -= n;
    return true;
  }
}

// How many invoices one connection may handle with what is left, given the
// fixed cost of a connection and the extra cost per invoice.
export function invoiceCap(left: number, fixed: number, perInvoice: number, max: number): number {
  if (left < fixed) return 0;
  if (perInvoice <= 0) return max;
  return Math.max(0, Math.min(max, Math.floor((left - fixed) / perInvoice)));
}

// ---------- plain English errors ----------

export function connectionError(provider: Provider, kind: "expired" | "api" | "network"): string {
  const n = PROVIDER_NAMES[provider];
  if (kind === "expired")
    return `${n} has disconnected us (this happens if access is removed or not used for a long time). Click Reconnect.`;
  if (kind === "network") return `We could not reach ${n}. We will try again within the hour.`;
  return `${n} did not send the invoices this time. We will try again within the hour.`;
}
