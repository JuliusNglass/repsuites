/* eslint-disable @typescript-eslint/no-explicit-any -- Companies House JSON is checked field by field. */
// Server-only: look up who owns a UK business on Companies House (free API).
// Two outside calls: a company search by name, then that company's officers.
// The key goes in the Cloudflare secret REPSUITES_COMPANIES_HOUSE_KEY; with no
// key the feature stays hidden.
import { serviceWrite } from "./supabase-service.server";
import {
  activeOwners,
  isUkAddress,
  pickCompany,
  type ChOfficerItem,
  type ChSearchItem,
  type Officer,
  type OwnerMatch,
} from "./prospect-owner";

const BASE = "https://api.company-information.service.gov.uk";

export function chKey(): string {
  return (process.env["REPSUITES_COMPANIES_HOUSE_KEY"] ?? "").trim();
}

async function ch(path: string, key: string): Promise<any | null> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Basic ${btoa(`${key}:`)}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export interface OwnerLookup {
  // false when the lookup could not run (no key, not UK, Companies House down).
  ran: boolean;
  companyNumber: string | null;
  companyName: string | null;
  owners: Officer[];
  match: OwnerMatch | null;
}

const NOT_RUN: OwnerLookup = {
  ran: false,
  companyNumber: null,
  companyName: null,
  owners: [],
  match: null,
};

export async function lookupOwner(business: {
  name: string;
  address: string;
}): Promise<OwnerLookup> {
  const key = chKey();
  if (!key || !business.name || !isUkAddress(business.address)) return NOT_RUN;
  const q = business.name.slice(0, 120);
  const found = await ch(`/search/companies?q=${encodeURIComponent(q)}&items_per_page=5`, key);
  if (!found) return NOT_RUN;
  const items: ChSearchItem[] = Array.isArray(found.items) ? found.items : [];
  const company = pickCompany(items, business);
  if (!company)
    return { ran: true, companyNumber: null, companyName: null, owners: [], match: null };
  const off = await ch(
    `/company/${encodeURIComponent(company.number)}/officers?items_per_page=35`,
    key,
  );
  if (!off) return NOT_RUN;
  const owners = activeOwners(Array.isArray(off.items) ? (off.items as ChOfficerItem[]) : []);
  return {
    ran: true,
    companyNumber: company.number,
    companyName: company.name,
    owners,
    match: owners.length ? company.match : null,
  };
}

// Columns to save on the prospect after a lookup that ran.
export function ownerColumns(l: OwnerLookup): Record<string, unknown> {
  if (!l.ran) return {};
  const found = l.owners.length > 0;
  return {
    company_number: l.companyNumber,
    company_name: l.companyName,
    owners: l.owners,
    owner_source: found ? "companies_house" : null,
    owner_match: found ? l.match : null,
    owner_looked_up_at: new Date().toISOString(),
  };
}

// "Find owner" on a saved prospect.
export async function findOwnerFor(row: {
  id: string;
  name: string;
  address: string | null;
}): Promise<{ ok: true; found: boolean } | { ok: false; error: string }> {
  if (!chKey()) return { ok: false, error: "Add a Companies House key to look up owners." };
  if (!isUkAddress(row.address ?? ""))
    return { ok: false, error: "Companies House only covers UK businesses." };
  const l = await lookupOwner({ name: row.name, address: row.address ?? "" });
  if (!l.ran) return { ok: false, error: "Companies House did not answer. Try again later." };
  const w = await serviceWrite<unknown>(`prospects?id=eq.${row.id}`, "", {
    method: "PATCH",
    body: { ...ownerColumns(l), updated_at: new Date().toISOString() },
  });
  if (w.error) return { ok: false, error: "Could not save." };
  return { ok: true, found: l.owners.length > 0 };
}
