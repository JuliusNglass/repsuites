import { ghlLeadBody, GHL_LOCATION_ID, type GhlLeadInput } from "./ghl-lead";

// Best effort: a failure here must never lose the lead (it is already saved
// in Supabase). Needs GHL_PRIVATE_TOKEN (a private integration token for the
// Accelur8 Ltd sub-account with contacts.write). Without it, skips quietly.
export async function pushLeadToGhl(p: GhlLeadInput): Promise<boolean> {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token) return false;
  if (!p.email && !p.phone) return false;
  try {
    const r = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(ghlLeadBody(p)),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) console.error("GHL lead upsert failed", r.status);
    return r.ok;
  } catch {
    return false;
  }
}

// A paid Fix-It Pack: tag the contact so GHL stops the sales follow-ups
// ("customer") and starts delivery ("fixit-paid"). Best effort, like above.
export async function tagFixitPaid(p: {
  email: string | null;
  phone: string | null;
  name: string | null;
  business: string | null;
}): Promise<boolean> {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token || (!p.email && !p.phone)) return false;
  const [firstName, ...rest] = String(p.name ?? "")
    .trim()
    .split(/\s+/);
  try {
    const r = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        locationId: GHL_LOCATION_ID,
        ...(p.email ? { email: p.email } : {}),
        ...(p.phone ? { phone: p.phone } : {}),
        ...(firstName ? { firstName } : {}),
        ...(rest.length ? { lastName: rest.join(" ") } : {}),
        ...(p.business ? { companyName: p.business } : {}),
        tags: ["customer", "fixit-paid"],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) console.error("GHL fixit tag failed", r.status);
    return r.ok;
  } catch {
    return false;
  }
}

// Adds tags to an existing GHL contact found by email (or phone), without
// touching its other tags. Best effort, like above.
export async function addGhlTags(p: {
  email: string | null;
  phone: string | null;
  tags: string[];
}): Promise<boolean> {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token || (!p.email && !p.phone) || !p.tags.length) return false;
  const headers = {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  try {
    const u = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
      method: "POST",
      headers,
      body: JSON.stringify({
        locationId: GHL_LOCATION_ID,
        ...(p.email ? { email: p.email } : {}),
        ...(p.phone ? { phone: p.phone } : {}),
      }),
      signal: AbortSignal.timeout(6000),
    });
    const id = u.ok ? ((await u.json()) as { contact?: { id?: string } }).contact?.id : null;
    if (!id) {
      console.error("GHL tag upsert failed", u.status);
      return false;
    }
    const r = await fetch(`https://services.leadconnectorhq.com/contacts/${id}/tags`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tags: p.tags }),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) console.error("GHL add tags failed", r.status);
    return r.ok;
  } catch {
    return false;
  }
}

// A new free RepSuites account: create or update the GHL contact so the
// sign-up journey (onboarding, upgrade nudges) can run there. Best effort.
export async function pushSignupToGhl(p: {
  name: string;
  email: string;
  business: string;
  source: string;
}): Promise<boolean> {
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  if (!token || !p.email) return false;
  const first = p.name.trim().split(/\s+/)[0] ?? "";
  const last = p.name.trim().split(/\s+/).slice(1).join(" ");
  const src =
    p.source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "direct";
  try {
    const r = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        locationId: GHL_LOCATION_ID,
        email: p.email,
        firstName: first,
        ...(last ? { lastName: last } : {}),
        companyName: p.business,
        source: `RepSuites free sign-up (${src})`,
        tags: ["repsuites-free-signup", "repsuites-free", `signup-src-${src}`],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) console.error("GHL sign-up push failed", r.status);
    return r.ok;
  } catch {
    return false;
  }
}
