// Server-only: the Accelur8 team adds a client business by hand. Creates the
// business on the chosen plan with its QR code and Google review link. With
// an owner email, gives that person the business: a new person gets an email
// with a link to set their own password (we never set or see one); someone
// who already has an account just gets access. A prospect for the same
// Google place is marked won. No em dashes in this copy (AGENTS.md).
import { sendEmail } from "./email.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { adminAuth } from "./signup.server";
import { PLACE_RE, reviewUrl } from "./signup";
import { addedNote, featuresFor, type AddPlan } from "./add-business";
import { SHARED_ORIGIN } from "./tenant-links.server";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface AddBusinessData {
  name: string;
  placeId?: string | undefined;
  ownerName?: string | undefined;
  ownerEmail?: string | undefined;
  plan: AddPlan;
}

type Owner = { status: "none" | "invited" | "access" | "failed"; note?: string };

export async function addBusiness(d: AddBusinessData, addedBy: string) {
  const name = d.name.trim().slice(0, 120);
  const placeId = d.placeId && PLACE_RE.test(d.placeId) ? d.placeId : "";
  const ownerName = (d.ownerName ?? "").trim().slice(0, 120);
  const email = (d.ownerEmail ?? "").trim().toLowerCase();

  if (placeId) {
    const dup = await serviceRead<{ id: string; name: string }[]>(
      `tenants?select=id,name&settings->>place_id=eq.${encodeURIComponent(placeId)}&limit=1`,
      "",
    );
    const t = dup.data?.[0];
    if (t)
      return { ok: false as const, error: `${t.name} is already on RepSuites.`, tenantId: t.id };
  }

  const t = await serviceWrite<{ id: string }[]>("tenants", "", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      name,
      settings: {
        source: "agency",
        added_by: addedBy,
        ...(ownerName ? { owner_name: ownerName } : {}),
        ...(placeId ? { place_id: placeId } : {}),
      },
    },
  });
  const tenantId = t.data?.[0]?.id;
  if (!tenantId) return { ok: false as const, error: "We could not add the business. Try again." };

  const plan = await serviceWrite("tenant_plans?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: { tenant_id: tenantId, plan: d.plan, features: featuresFor(d.plan) },
  });
  if (plan.error) {
    await serviceWrite(`tenants?id=eq.${tenantId}`, "", { method: "DELETE" });
    return { ok: false as const, error: "We could not add the business. Try again." };
  }

  await serviceWrite("qr_links", "", {
    method: "POST",
    body: {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      kind: "business",
      active: true,
      business_name: name,
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

  const owner: Owner = email
    ? await giveOwner(tenantId, name, email, ownerName)
    : { status: "none" };

  let prospectLinked = false;
  if (placeId) {
    const p = await serviceRead<{ id: string; notes: string | null }[]>(
      `prospects?select=id,notes&place_id=eq.${encodeURIComponent(placeId)}`,
      "",
    );
    for (const row of p.data ?? []) {
      const u = await serviceWrite(`prospects?id=eq.${row.id}`, "", {
        method: "PATCH",
        body: {
          stage: "won",
          notes: addedNote(row.notes, new Date()),
          updated_at: new Date().toISOString(),
        },
      }).catch(() => null);
      if (u && !u.error) prospectLinked = true;
    }
  }

  return {
    ok: true as const,
    tenantId,
    reviewUrl: placeId ? reviewUrl(placeId) : null,
    owner,
    prospectLinked,
  };
}

async function giveOwner(
  tenantId: string,
  business: string,
  email: string,
  ownerName: string,
): Promise<Owner> {
  // New person: account with the email already confirmed and no password.
  let invite = true;
  let userId = "";
  const u = await adminAuth("users", "POST", {
    email,
    email_confirm: true,
    user_metadata: ownerName ? { full_name: ownerName } : {},
  });
  if (u.ok) userId = String(u.data?.id ?? u.data?.user?.id ?? "");
  else {
    const msg = String(u.data?.msg ?? u.data?.message ?? u.data?.error_code ?? "");
    if (!(u.status === 422 || /already|registered|exists/i.test(msg)))
      return { status: "failed", note: "We could not create the owner's account." };
    // They already have an account: find it (this sends nothing).
    invite = false;
    const l = await adminAuth("generate_link", "POST", { type: "magiclink", email });
    userId = String(l.data?.id ?? l.data?.user?.id ?? "");
  }
  if (!/^[0-9a-f-]{36}$/i.test(userId))
    return { status: "failed", note: "We could not find the owner's account." };

  const have = await serviceRead<{ user_id: string }[]>(
    `tenant_memberships?select=user_id&tenant_id=eq.${tenantId}&user_id=eq.${userId}`,
    "",
  );
  if (!have.data?.length) {
    const m = await serviceWrite("tenant_memberships", "", {
      method: "POST",
      body: { tenant_id: tenantId, user_id: userId, role: "owner", active: true },
    });
    if (m.error) return { status: "failed", note: "We could not give the owner access." };
  }
  if (!invite) return { status: "access" };

  const l = await adminAuth("generate_link", "POST", {
    type: "recovery",
    email,
    redirect_to: `${SHARED_ORIGIN}/reset-password`,
  });
  const link = String(l.data?.action_link ?? l.data?.properties?.action_link ?? "");
  if (!link.startsWith("https://"))
    return {
      status: "failed",
      note: "Account made, but the invite link failed. They can use Forgot password.",
    };
  const sent = await sendEmail({
    to: email,
    replyTo: "support@repsuites.com",
    subject: `Your RepSuites account for ${business}`,
    html: `<p>Hi${ownerName ? ` ${esc(ownerName)}` : ""},</p>
<p>Accelur8 has set up RepSuites for <b>${esc(business)}</b>. RepSuites helps you get more Google reviews and see how your business shows up.</p>
<p><a href="${esc(link)}">Choose your password and sign in</a></p>
<p>The link works once and runs out after a while. If it has run out, go to repsuites.com/login and use Forgot password.</p>
<p>Questions? Just reply to this email.</p>`,
  });
  return sent.ok
    ? { status: "invited" }
    : {
        status: "failed",
        note: "Account made, but the invite email failed. They can use Forgot password.",
      };
}
