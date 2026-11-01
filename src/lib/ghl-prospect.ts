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
