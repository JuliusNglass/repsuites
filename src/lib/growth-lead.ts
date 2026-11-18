// SparkOps Growth page form handler. The page lives on its own worker
// (sparkops-growth); its form posts here because this app already holds the
// GHL token. Qualified owners go to the SparkOps Fit Call calendar.
/* eslint-disable @typescript-eslint/no-explicit-any */
const LOCATION_ID = "HzEU9UBWZEzxuB5SSDYE";
const FIT_CALL = "https://uklink.accelur8.com/widget/bookings/sparkops-fit-call";

// Existing GHL fields reused, plus the four GRW fields made for this page.
const F = {
  cleaners: "30uO3tfZeOEKZzQUwwQZ", // Number of Cleaners
  website: "OrLtpFfsTi9PTjluxjTP", // Website Url
  bottleneck: "BQzdFe0goALM8O7kB9mm", // Biggest Bottleneck
  split: "LNYboX0RNlQECsIwP9vX",
  ready: "PUb4Tv1Fv7TJrcdgvSp8",
  timing: "TyfsO0maOUnEFHdpanGL",
  phase: "17r2B2fFesCQTNqbvk7u",
};

const OPT = {
  cleaners: { solo: "Just me", "1-3": "1 to 3", "4-10": "4 to 10", "11+": "11 or more" },
  split: {
    dom: "All domestic",
    mostdom: "Mostly domestic",
    half: "About 50:50",
    mostcom: "Mostly commercial",
  },
  bottleneck: {
    hiring: "Finding and keeping reliable cleaners",
    commercial: "Winning commercial contracts",
    rebook: "Getting past clients to rebook",
    ops: "Admin and day-to-day organisation",
  },
  ready: {
    yes: "Yes, we're ready",
    hire: "We'd need to hire first",
    no: "Not looking for commercial work",
  },
  timing: { now: "Ready now", "3m": "In the next 3 months", research: "Just researching for now" },
};

const PHASE = {
  hiring: "Phase Two: Hiring Funnel",
  commercial: "Phase Three: Commercial Pipeline",
  rebook: "Phase One: Bookings & Reviews",
  ops: "SparkOps Core (operations)",
};

export function route(a: {
  cleaners?: string;
  timing?: string;
  bottleneck?: string;
  ready?: string;
}) {
  // Pure routing so it can be tested.
  const solo = a.cleaners === "solo";
  const research = a.timing === "research";
  let lead: string = a.bottleneck ?? "ops";
  if (a.bottleneck === "commercial" && a.ready !== "yes") lead = "hiring";
  if (a.ready === "hire" && a.bottleneck !== "rebook" && a.bottleneck !== "ops") lead = "hiring";
  return { qualified: !solo && !research, phaseKey: lead, solo, research };
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clean = (s: unknown, n = 200) =>
  String(s ?? "")
    .trim()
    .slice(0, n);

export async function pushGhl(token: string, d: any, r: ReturnType<typeof route>) {
  const tags = [
    "grw-lead",
    `src-${d.src || "direct"}`,
    ...(d.angle ? [`angle-${d.angle}`] : []),
    `lead-${r.phaseKey}`,
    r.qualified ? "qualified" : r.solo ? "solo" : "nurture",
    ...(d.wa ? ["consent-whatsapp"] : []),
  ];
  const [firstName, ...rest] = (d.name as string).split(/\s+/);
  const body = {
    locationId: LOCATION_ID,
    firstName,
    lastName: rest.join(" "),
    email: d.email,
    phone: d.phone,
    companyName: d.business,
    source: `SparkOps growth page (${d.src || "direct"})`,
    customFields: [
      { id: F.cleaners, field_value: (OPT.cleaners as any)[d.cleaners] },
      { id: F.website, field_value: d.site },
      { id: F.bottleneck, field_value: (OPT.bottleneck as any)[d.bottleneck] },
      { id: F.split, field_value: (OPT.split as any)[d.split] },
      { id: F.ready, field_value: (OPT.ready as any)[d.ready] },
      { id: F.timing, field_value: (OPT.timing as any)[d.timing] },
      { id: F.phase, field_value: (PHASE as any)[r.phaseKey] },
    ].filter((x) => x.field_value),
  };
  for (let i = 0; i < 3; i++) {
    const res = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (res?.ok) {
      // Upsert replaces the whole tag list, so tags are added separately
      // to keep any tags the contact already has.
      const j = (await res.json().catch(() => null)) as { contact?: { id?: string } } | null;
      const id = j?.contact?.id;
      if (!id) return false;
      const t = await fetch(`https://services.leadconnectorhq.com/contacts/${id}/tags`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ tags }),
      }).catch(() => null);
      return !!t?.ok;
    }
    await new Promise((x) => setTimeout(x, 800 * (i + 1)));
  }
  return false;
}

export function validate(f: FormData): any {
  const d = {
    name: clean(f.get("name"), 120),
    email: clean(f.get("email"), 200).toLowerCase(),
    phone: clean(f.get("phone"), 40),
    business: clean(f.get("business"), 160),
    site: clean(f.get("site"), 300),
    cleaners: clean(f.get("cleaners"), 10),
    split: clean(f.get("split"), 10),
    bottleneck: clean(f.get("bottleneck"), 12),
    ready: clean(f.get("ready"), 10),
    timing: clean(f.get("timing"), 10),
    wa: f.get("wa") === "1",
    src: clean(f.get("src"), 30)
      .replace(/[^a-z0-9-]/gi, "")
      .toLowerCase(),
    angle: clean(f.get("angle"), 10)
      .replace(/[^a-z0-9-]/gi, "")
      .toLowerCase(),
    trap: clean(f.get("company_fax"), 50),
    eid: clean(f.get("eid"), 64).replace(/[^a-z0-9-]/gi, ""),
    fbp: clean(f.get("fbp"), 200),
    fbc: clean(f.get("fbc"), 300),
  };
  const ok =
    d.name.length > 1 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email) &&
    d.phone.replace(/\D/g, "").length >= 10 &&
    d.business.length > 1 &&
    (OPT.cleaners as any)[d.cleaners] &&
    (OPT.split as any)[d.split] &&
    (OPT.bottleneck as any)[d.bottleneck] &&
    (OPT.ready as any)[d.ready] &&
    (OPT.timing as any)[d.timing];
  return ok ? d : null;
}

export function bookingUrl(d: any) {
  const [first, ...rest] = (d.name as string).split(/\s+/);
  const q = new URLSearchParams({
    first_name: first ?? "",
    last_name: rest.join(" "),
    email: d.email,
    phone: d.phone,
  });
  return `${FIT_CALL}?${q}`;
}
