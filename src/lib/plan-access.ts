// Plans, features and payment status. Client-safe (no server imports).
//
// The database decides the plan and the payment stage
// (public.repsuites_tenant_access). This file only interprets the answer, so
// the same rules apply on the server (blocking changes) and in the browser
// (banners, hidden menu items).

export type Feature = "ranking" | "ai_visibility" | "nfc";
export type Plan = "free" | "pro" | "gold";
export type PaymentStatus = "active" | "overdue" | "read_only" | "on_hold" | "cancelled";

export interface TenantAccess {
  tenantId: string;
  plan: Plan;
  features: Feature[];
  status: PaymentStatus;
  daysOverdue: number;
  dueDate: string | null;
  amountDuePence: number | null;
  invoiceNumber: string | null;
  payUrl: string | null;
  readOnlyFrom: string | null;
  onHoldFrom: string | null;
  // The signed-in person is an Accelur8 agency operator. Agency operators are
  // never locked out, so they can always fix a business's account.
  agency: boolean;
}

export const PLANS: Plan[] = ["free", "pro", "gold"];
export const FEATURES: Feature[] = ["ranking", "ai_visibility", "nfc"];
const STATUSES: PaymentStatus[] = ["active", "overdue", "read_only", "on_hold", "cancelled"];

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  gold: "Gold",
};

export const FEATURE_LABELS: Record<Feature, string> = {
  ranking: "Google Maps ranking grid",
  ai_visibility: "AI search checks",
  nfc: "NFC review cards",
};

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  active: "Active",
  overdue: "Overdue",
  read_only: "Read-only",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

// Used when the status cannot be read (network blip, old database). Failing
// open keeps paying clients working; the daily check and the next request
// catch up.
export function fullAccess(tenantId: string): TenantAccess {
  return {
    tenantId,
    plan: "free",
    features: [],
    status: "active",
    daysOverdue: 0,
    dueDate: null,
    amountDuePence: null,
    invoiceNumber: null,
    payUrl: null,
    readOnlyFrom: null,
    onHoldFrom: null,
    agency: false,
  };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

// Validate the RPC answer. Anything malformed falls back to full access.
export function parseTenantAccess(raw: unknown, tenantId: string): TenantAccess {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fullAccess(tenantId);
  const r = raw as Record<string, unknown>;
  const plan = PLANS.includes(r["plan"] as Plan) ? (r["plan"] as Plan) : null;
  const status = STATUSES.includes(r["status"] as PaymentStatus)
    ? (r["status"] as PaymentStatus)
    : null;
  if (!plan || !status) return fullAccess(tenantId);
  const features = Array.isArray(r["features"])
    ? (r["features"] as unknown[]).filter((f): f is Feature => FEATURES.includes(f as Feature))
    : [];
  const days = Number(r["daysOverdue"]);
  const amount = r["amountDuePence"];
  const payUrl = str(r["payUrl"]);
  return {
    tenantId,
    plan,
    features,
    status,
    daysOverdue: Number.isFinite(days) && days > 0 ? Math.floor(days) : 0,
    dueDate: str(r["dueDate"]),
    amountDuePence: typeof amount === "number" && amount >= 0 ? Math.round(amount) : null,
    invoiceNumber: str(r["invoiceNumber"]),
    payUrl: payUrl && payUrl.startsWith("https://") ? payUrl : null,
    readOnlyFrom: str(r["readOnlyFrom"]),
    onHoldFrom: str(r["onHoldFrom"]),
    agency: r["agency"] === true,
  };
}

export function hasFeature(access: TenantAccess | null | undefined, feature: Feature): boolean {
  if (!access) return true;
  return access.agency || access.features.includes(feature);
}

export type AccessAudience = "management" | "cleaner";

// Can this audience make changes right now? Management stops at read-only;
// cleaners keep completing today's visits until the account is on hold.
export function changesBlocked(access: TenantAccess | null | undefined, who: AccessAudience) {
  if (!access || access.agency) return false;
  if (access.status === "on_hold" || access.status === "cancelled") return true;
  return who === "management" && access.status === "read_only";
}

export const PAUSED_MESSAGE = "Your company account is paused. Please contact your manager.";

export function blockedMessage(access: TenantAccess, who: AccessAudience): string {
  if (access.status === "cancelled") return "This business account has been closed.";
  if (who === "cleaner") return PAUSED_MESSAGE;
  if (access.status === "on_hold")
    return "This account is on hold because of an unpaid invoice. Pay the invoice to restore access.";
  return "This account is read-only because of an unpaid invoice. You can still view everything. Pay the invoice to make changes again.";
}

export function notInPlanMessage(feature: Feature): string {
  return `${FEATURE_LABELS[feature]} is not included in your plan. Contact Accelur8 to add it.`;
}

export function formatPence(pence: number | null): string {
  if (pence === null) return "";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

// "2026-11-01" -> "1 November 2026". Date-only, no timezone shifting.
export function formatDay(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}
