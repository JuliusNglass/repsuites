/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase JSON is checked field by field. */
// Server-only: free self-serve sign-up. Creates the person (email already
// confirmed), their business on the free plan, its QR code and Google review
// link, then signs them in. No em dashes in this copy (AGENTS.md).
import { performSignIn } from "./auth.server";
import { getSupabaseConfig } from "./config.server";
import { sendEmail } from "./email.server";
import { getServiceKey, serviceRead, serviceWrite } from "./supabase-service.server";
import {
  PLACE_RE,
  REPORT_RE,
  prefillName,
  reviewUrl,
  signupProblem,
  stageAfterSignup,
} from "./signup";
import { ownerFirstName, type Officer } from "./prospect-owner";
import type { SignupInput } from "./signup";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function adminAuth(path: string, method: string, body?: unknown) {
  const cfg = getSupabaseConfig();
  const key = getServiceKey();
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers["Authorization"] = `Bearer ${key}`;
  try {
    const r = await fetch(`${cfg.url}/auth/v1/admin/${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await r.json().catch(() => null)) as any;
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

// What the /start page shows from a prospect report link.
export async function signupPrefill(r: string) {
  if (!REPORT_RE.test(r)) return null;
  const p = await serviceRead<
    {
      name: string;
      place_id: string | null;
      contact_name: string | null;
      owners: Officer[] | null;
      website_owner_name: string | null;
    }[]
  >(
    `prospects?select=name,place_id,contact_name,owners,website_owner_name&report_token=eq.${r}`,
    "",
  );
  const row = p.data?.[0];
  if (!row) return null;
  const owners = Array.isArray(row.owners) ? row.owners : [];
  return {
    business: row.name,
    placeId: row.place_id ?? "",
    name: prefillName(row.contact_name, ownerFirstName(owners, row.website_owner_name)),
  };
}

export async function signUpFree(
  input: SignupInput & {
    placeId?: string | undefined;
    report?: string | undefined;
    website?: string | undefined;
    bonus?: string | undefined;
    came?: string | undefined;
  },
) {
  // Honeypot: people never fill the hidden "website" box; bots do.
  if (input.website) return { ok: false as const, error: "Something went wrong. Try again." };
  const problem = signupProblem(input);
  if (problem) return { ok: false as const, error: problem };
  if (!getServiceKey()) return { ok: false as const, error: "Sign-up is not available just now." };

  // Light limit: at most 30 new free accounts an hour across the site.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const recent = await serviceRead<{ id: string }[]>(
    `tenants?select=id&settings->>source=eq.self_serve&created_at=gte.${hourAgo}&limit=31`,
    "",
  );
  if ((recent.data?.length ?? 0) >= 30)
    return { ok: false as const, error: "We are very busy. Please try again in an hour." };

  const email = input.email.trim().toLowerCase();
  const business = input.business.trim().slice(0, 120);
  const name = input.name.trim().slice(0, 120);
  // Where they came from: utm tags or the site that sent them (no personal data).
  const came = (input.came ?? "").replace(/[^\w .:/=&|-]/g, "").slice(0, 160);

  // The prospect report they came from, if any.
  let prospect: {
    id: string;
    place_id: string | null;
    stage: string;
    notes: string | null;
  } | null = null;
  if (input.report && REPORT_RE.test(input.report)) {
    const p = await serviceRead<any[]>(
      `prospects?select=id,place_id,stage,notes&report_token=eq.${input.report}`,
      "",
    );
    prospect = p.data?.[0] ?? null;
  }
  const placeId =
    prospect?.place_id && PLACE_RE.test(prospect.place_id)
      ? prospect.place_id
      : input.placeId && PLACE_RE.test(input.placeId)
        ? input.placeId
        : "";

  const u = await adminAuth("users", "POST", {
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (!u.ok) {
    const msg = String(u.data?.msg ?? u.data?.message ?? u.data?.error_description ?? "");
    if (u.status === 422 || /already|registered|exists/i.test(msg))
      return { ok: false as const, error: "You already have an account. Sign in." };
    if (/password/i.test(msg))
      return { ok: false as const, error: "Choose a stronger password, with letters and numbers." };
    return { ok: false as const, error: "We could not create your account. Try again." };
  }
  const userId = String(u.data?.id ?? u.data?.user?.id ?? "");

  const undo = async () => {
    if (userId) await adminAuth(`users/${userId}`, "DELETE");
  };

  const t = await serviceWrite<{ id: string }[]>("tenants", "", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      name: business,
      settings: {
        source: "self_serve",
        owner_name: name,
        ...(came ? { came } : {}),
        ...(placeId ? { place_id: placeId } : {}),
      },
    },
  });
  const tenantId = t.data?.[0]?.id;
  if (!tenantId) {
    await undo();
    return { ok: false as const, error: "We could not create your account. Try again." };
  }
  const [m, plan] = await Promise.all([
    serviceWrite("tenant_memberships", "", {
      method: "POST",
      body: { tenant_id: tenantId, user_id: userId, role: "owner", active: true },
    }),
    serviceWrite("tenant_plans?on_conflict=tenant_id", "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: { tenant_id: tenantId, plan: "free", features: [] },
    }),
  ]);
  if (m.error || plan.error) {
    await serviceWrite(`tenants?id=eq.${tenantId}`, "", { method: "DELETE" });
    await undo();
    return { ok: false as const, error: "We could not create your account. Try again." };
  }

  // Fix-It Pack buyers: their free month of Growth (once per order).
  let bonus = false;
  if (input.bonus) {
    const { claimFixitBonus } = await import("./fixit-bonus.server");
    bonus = await claimFixitBonus(input.bonus, tenantId).catch(() => false);
  }

  // A 6-digit code to confirm their email (they can use the account now).
  {
    const { sendEmailCode } = await import("./email-check.server");
    await sendEmailCode(userId, email, true).catch(() => null);
  }

  // Their QR code and review page, pointing at Google when we know the place.
  await serviceWrite("qr_links", "", {
    method: "POST",
    body: {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      kind: "business",
      active: true,
      business_name: business,
      google_place_id: placeId || null,
      target_url: placeId ? reviewUrl(placeId) : null,
    },
  }).catch(() => null);
  if (placeId)
    await serviceWrite("review_links", "", {
      method: "POST",
      body: {
        tenant_id: tenantId,
        platform: "google",
        label: "Google",
        url: reviewUrl(placeId),
        position: 0,
      },
    }).catch(() => null);

  if (prospect) {
    const day = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    await serviceWrite(`prospects?id=eq.${prospect.id}`, "", {
      method: "PATCH",
      body: {
        stage: stageAfterSignup(prospect.stage),
        notes: [prospect.notes, `Signed up free ${day} (${email})`]
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000),
        updated_at: new Date().toISOString(),
      },
    }).catch(() => null);
  }

  const to = (process.env["REPSUITES_LEADS_TO"] ?? "").trim() || "julius@accelur8.com";
  const { hqAfter } = await import("./hq.server");
  const { pushSignupToGhl } = await import("./ghl-lead.server");
  await Promise.all([
    pushSignupToGhl({
      name,
      email,
      business,
      source: prospect
        ? "report"
        : (came.match(/utm_source=([\w.-]+)/)?.[1] ?? came.match(/ref=([\w.-]+)/)?.[1] ?? "direct"),
    }).catch(() => false),
    // Accelur8 HQ: a new business account (runs alongside the emails, never fails sign-up).
    hqAfter(() => ({
      event: "signed_up",
      idempotency_key: `tenant:${tenantId}:signed_up`,
      contact: { email, name, role: "owner" },
      company: { name: business },
      product_link: { type: "tenant", id: tenantId },
      data: {
        source: "self_serve",
        plan: "free",
        from_report: !!prospect,
        ...(prospect ? { prospect_id: prospect.id } : {}),
        ...(placeId ? { place_id: placeId } : {}),
      },
    })),
    sendEmail({
      to,
      subject: prospect
        ? `${business} signed up from their report`
        : `New free sign-up: ${business}`,
      html: `<p><b>${esc(business)}</b> signed up for a free account.</p>
<p>${esc(name)}<br>${esc(email)}</p>
<p>${prospect ? "They came from their prospect report." : "They signed up from the website."} Came from: ${esc(prospect ? "report" : came || "direct or unknown")}. ${placeId ? "Their Google review link is set up." : "No Google listing chosen yet."}</p>
<p>Next: help them print their QR code, then offer a table stand and RepSuites Growth.</p>`,
    }).catch(() => null),
    sendEmail({
      to: email,
      replyTo: to,
      fromName: "Julius at RepSuites",
      subject: `${name.split(" ")[0]}, your first job takes 60 seconds`,
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#0f172a;max-width:560px">
<p>Hi ${esc(name.split(" ")[0] ?? "")},</p>
<p>Your RepSuites account for <b>${esc(business)}</b> is ready.</p>
<p>Do one thing today: connect your Google profile. Then RepSuites can show you how many people found you on Google last month, with your reviews in one place.</p>
<ol><li style="margin:0 0 6px">Open Settings and press <b>Connect Google</b>.</li><li style="margin:0 0 6px">Sign in with the Google account you use for your business.</li><li style="margin:0 0 6px">Press <b>Allow</b>.</li></ol>
<p style="margin:20px 0"><a href="https://repsuites.com/dashboard#settings" style="background:#f5b324;color:#0f172a;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px;display:inline-block">Connect Google now</a></p>
<p>No time, or not sure where to start? Just reply "help" and we will set it up with you.</p>
<p>Quick question: how did you find RepSuites? One word is fine.</p>
<p>Julius<br>RepSuites, by Accelur8</p></div>`,
    }).catch(() => null),
  ]);

  const s = await performSignIn(email, input.password);
  if (!s.ok) return { ok: true as const, signedIn: false as const, bonus };
  return { ok: true as const, signedIn: true as const, bonus };
}
