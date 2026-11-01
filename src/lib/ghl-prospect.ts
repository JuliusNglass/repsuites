// Builds the payload sent to the Accelur8 GoHighLevel "Prospect follow-up"
// workflow when a prospect is marked as contacted. Pure, so it can be tested.

export type GhlProspectInput = {
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  report_token: string | null;
  product: string | null;
};

// Accelur8 Ltd sub-account, workflow "Prospect follow-up (WhatsApp contacted)".
export const GHL_DEFAULT_URL =
  "https://services.leadconnectorhq.com/hooks/HzEU9UBWZEzxuB5SSDYE/webhook-trigger/sidfYiEU9hJ32b4FBL5i";

// Where to push prospects, or null to skip. Unset: the Accelur8 workflow.
// "off" (or "none", "false", "disabled"): GHL is switched off. Anything that
// is not an https link is treated as missing config and skipped.
export function ghlProspectUrl(setting: string | undefined): string | null {
  const v = (setting ?? "").trim();
  if (!v) return GHL_DEFAULT_URL;
  if (/^(off|none|false|disabled|0)$/i.test(v)) return null;
  return /^https:\/\/\S+$/.test(v) ? v : null;
}

export function splitName(full: string | null): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

export function ghlProspectPayload(p: GhlProspectInput, via: string, at: Date) {
  const { first, last } = splitName(p.contact_name);
  return {
    first_name: first,
    last_name: last,
    business_name: p.name,
    phone: p.phone ?? "",
    email: p.email ?? "",
    report_url: p.report_token ? `https://repsuites.com/r/${p.report_token}` : "",
    product: p.product === "sparkops" ? "sparkops" : "repsuites",
    contacted_at: at.toISOString(),
    contacted_via: via,
  };
}
