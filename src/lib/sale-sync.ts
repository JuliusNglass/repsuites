// Pure helpers for the won-deal sync (GHL won opportunity -> Meta Purchase + owner alert).
export const SALE_START = "2026-11-19T00:00:00Z";

export type WonOpp = {
  id: string;
  name?: string | null;
  monetaryValue?: number | null;
  status?: string | null;
  lastStatusChangeAt?: string | null;
  updatedAt?: string | null;
  contact?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

// A sale counts once it is won after the start date (older wins are never sent to Meta).
export function isNewSale(o: WonOpp, start = SALE_START): boolean {
  const at = o.lastStatusChangeAt ?? o.updatedAt ?? "";
  return o.status === "won" && !!o.contact?.id && !!at && new Date(at) >= new Date(start);
}

export function saleTitle(o: WonOpp): string {
  const v = Number(o.monetaryValue) || 0;
  const who = o.contact?.name || o.name || "a client";
  return `Sale won: ${who}${v > 0 ? ` (£${v.toLocaleString("en-GB")})` : ""}`;
}
