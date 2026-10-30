// Server-only: people who sign up at /start confirm their email with a
// 6-digit code. They can use their account straight away; only the things
// that rely on a real email wait (upgrading, review requests, the monthly
// report, private feedback emails). Connecting a Google account with the same
// email confirms it too. Everyone without a row (older accounts, the
// Accelur8 team) counts as confirmed. No em dashes in this copy (AGENTS.md).
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { sendEmail } from "./email.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { codeOk, newCode } from "./email-check";

interface Row {
  user_id: string;
  email: string;
  code_hash: string | null;
  sent_at: string | null;
  sends_today: number;
  attempts: number;
  verified_at: string | null;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
export const UNCONFIRMED =
  "Please confirm your email first. Enter the 6-digit code we emailed you, at the top of your dashboard.";

async function hash(userId: string, code: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${code}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rowFor(userId: string): Promise<Row | null> {
  if (!UUID_RE.test(userId)) return null;
  const r = await serviceRead<Row[]>(
    `email_checks?select=user_id,email,code_hash,sent_at,sends_today,attempts,verified_at&user_id=eq.${userId}`,
    "",
  );
  return r.data?.[0] ?? null;
}

// Null when confirmed (or never needed), else the message to show.
export async function emailUnconfirmed(userId: string): Promise<string | null> {
  const r = await rowFor(userId);
  return r && !r.verified_at ? UNCONFIRMED : null;
}

// Emails a fresh code. Called at sign-up and by "Send a new code".
export async function sendEmailCode(userId: string, email: string, first = false) {
  const now = Date.now();
  const r = await rowFor(userId);
  if (r?.verified_at) return { ok: true as const, already: true as const };
  if (r?.sent_at && now - Date.parse(r.sent_at) < 60_000)
    return { ok: false as const, error: "We just sent one. Wait a minute, then try again." };
  const sameDay = r?.sent_at && new Date(r.sent_at).toDateString() === new Date(now).toDateString();
  const sends = sameDay ? (r?.sends_today ?? 0) : 0;
  if (sends >= 5) return { ok: false as const, error: "Too many codes today. Try again tomorrow." };
  const code = newCode();
  await serviceWrite("email_checks?on_conflict=user_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      user_id: userId,
      email: email.toLowerCase(),
      code_hash: await hash(userId, code),
      sent_at: new Date(now).toISOString(),
      sends_today: sends + 1,
      attempts: 0,
    },
  });
  const sent = await sendEmail({
    to: email,
    replyTo: "support@repsuites.com",
    subject: `${code} is your RepSuites code`,
    html: `<p>${first ? "Welcome to RepSuites. " : ""}Your code is:</p>
<p style="font-size:28px;font-weight:800;letter-spacing:6px;margin:8px 0">${code}</p>
<p>Type it in at the top of your dashboard to confirm your email. It works for 24 hours.</p>
<p>If you did not sign up for RepSuites, you can ignore this email.</p>`,
  });
  return sent.ok ? { ok: true as const } : { ok: false as const, error: sent.error };
}

// Google already checked the email of the account they connected with.
export async function confirmByGoogle(userId: string, googleEmail: string | null) {
  if (!googleEmail) return;
  const r = await rowFor(userId);
  if (!r || r.verified_at || r.email !== googleEmail.toLowerCase()) return;
  await serviceWrite(`email_checks?user_id=eq.${userId}`, "", {
    method: "PATCH",
    body: { verified_at: new Date().toISOString(), verified_by: "google", code_hash: null },
  });
}

// Drops owner emails that have not been confirmed (so a made-up address
// does not get a business's private feedback).
export async function confirmedOnly(emails: string[]): Promise<string[]> {
  if (!emails.length) return emails;
  const list = emails.map((e) => `"${e.toLowerCase().replace(/"/g, "")}"`).join(",");
  const r = await serviceRead<{ email: string }[]>(
    `email_checks?select=email&verified_at=is.null&email=in.(${encodeURIComponent(list)})`,
    "",
  );
  const bad = new Set((r.data ?? []).map((x) => x.email));
  return emails.filter((e) => !bad.has(e.toLowerCase()));
}

// ---------- for the dashboard ----------

async function me() {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: false });
  return g.ok ? { userId: g.session.user_id, email: g.session.email ?? "" } : null;
}

export async function readEmailCheck() {
  const u = await me();
  if (!u) return { ok: false as const };
  const r = await rowFor(u.userId);
  return { ok: true as const, needed: !!r && !r.verified_at, email: r?.email ?? u.email };
}

export async function confirmEmailCode(code: string) {
  const u = await me();
  if (!u || !(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Please refresh the page and try again." };
  const r = await rowFor(u.userId);
  if (!r || r.verified_at) return { ok: true as const };
  if (r.attempts >= 5)
    return { ok: false as const, error: "Too many tries. Send a new code and use that one." };
  const fresh = !!r.sent_at && Date.now() - Date.parse(r.sent_at) < 24 * 3600_000;
  const right = fresh && codeOk(code) && r.code_hash === (await hash(u.userId, code.trim()));
  if (!right) {
    await serviceWrite(`email_checks?user_id=eq.${u.userId}`, "", {
      method: "PATCH",
      body: { attempts: r.attempts + 1 },
    });
    return {
      ok: false as const,
      error: fresh
        ? "That code is not right. Check the email and try again."
        : "That code has run out. Send a new one.",
    };
  }
  await serviceWrite(`email_checks?user_id=eq.${u.userId}`, "", {
    method: "PATCH",
    body: { verified_at: new Date().toISOString(), verified_by: "code", code_hash: null },
  });
  return { ok: true as const };
}

export async function resendEmailCode() {
  const u = await me();
  if (!u || !(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Please refresh the page and try again." };
  const r = await rowFor(u.userId);
  if (!r) return { ok: true as const };
  return sendEmailCode(u.userId, r.email);
}
