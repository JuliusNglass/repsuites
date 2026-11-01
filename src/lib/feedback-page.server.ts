// Server-only: the page behind every printed QR code.
//
// Google-compliant by design: every customer sees every review button the
// business has set up, with no rating question first and nothing that steers
// unhappy customers away from public reviews. Private feedback is offered to
// everyone as an extra, never instead of a review.
// No em dashes in this copy (AGENTS.md).
import { textOn } from "./brand";
import { READING_HEAD, READING_STYLE, readingToggle } from "./reading";
import { tenantKind } from "./business-type";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { sendEmail } from "./email.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Platform =
  "google" | "facebook" | "tripadvisor" | "trustpilot" | "yelp" | "booking" | "other";

export const PLATFORMS: Record<Platform, { name: string; colour: string; text: string }> = {
  google: { name: "Google", colour: "#1a73e8", text: "#ffffff" },
  facebook: { name: "Facebook", colour: "#1877f2", text: "#ffffff" },
  tripadvisor: { name: "Tripadvisor", colour: "#34e0a1", text: "#000000" },
  trustpilot: { name: "Trustpilot", colour: "#00b67a", text: "#0b1b33" },
  yelp: { name: "Yelp", colour: "#d32323", text: "#ffffff" },
  booking: { name: "Booking.com", colour: "#003580", text: "#ffffff" },
  other: { name: "our review page", colour: "#0b1b33", text: "#ffffff" },
};

export interface FeedbackTarget {
  qrId: string;
  tenantId: string | null;
  business: string;
  links: { platform: Platform; label: string; url: string }[];
  // The business's own colours (hex), when set.
  brand?: { primary: string; secondary: string | null } | null;
  // Restaurants, cafes, bars and hotels: "Thanks for visiting". Everyone
  // else: "Thanks for choosing".
  hospitality?: boolean;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function isQrId(id: string): boolean {
  return UUID_RE.test(id);
}

// Everything the page needs for one QR code, or null if the code is not live.
export async function loadFeedbackTarget(id: string): Promise<FeedbackTarget | null> {
  if (!UUID_RE.test(id)) return null;
  const q = await serviceRead<
    {
      id: string;
      tenant_id: string | null;
      kind: string;
      business_name: string | null;
      target_url: string | null;
      active: boolean;
    }[]
  >(`qr_links?select=id,tenant_id,kind,business_name,target_url,active&id=eq.${id}`, "");
  const qr = q.data?.[0];
  if (!qr || !qr.active) return null;

  let business = qr.business_name ?? "";
  let saved: { platform: Platform; label: string | null; url: string }[] = [];
  let brand: FeedbackTarget["brand"] = null;
  let hospitality = false;
  if (qr.tenant_id) {
    const [t, l, b] = await Promise.all([
      serviceRead<{ name: string; settings: unknown }[]>(
        `tenants?select=name,settings&id=eq.${qr.tenant_id}`,
        "",
      ),
      serviceRead<{ platform: Platform; label: string | null; url: string }[]>(
        `review_links?select=platform,label,url&tenant_id=eq.${qr.tenant_id}&active=eq.true&order=position.asc,created_at.asc`,
        "",
      ),
      serviceRead<{ primary_hex: string | null; secondary_hex: string | null }[]>(
        `business_branding?select=primary_hex,secondary_hex&tenant_id=eq.${qr.tenant_id}`,
        "",
      ),
    ]);
    business = t.data?.[0]?.name ?? business;
    hospitality = tenantKind(t.data?.[0] ?? { name: business }) === "hospitality";
    const pb = b.data?.[0];
    if (pb?.primary_hex && /^#[0-9a-f]{6}$/.test(pb.primary_hex))
      brand = {
        primary: pb.primary_hex,
        secondary:
          pb.secondary_hex && /^#[0-9a-f]{6}$/.test(pb.secondary_hex) ? pb.secondary_hex : null,
      };
    saved = (l.data ?? []).filter((x) => x.url.startsWith("https://") && x.platform in PLATFORMS);
  }

  // This code's own Google link (a branch code points at that branch's
  // listing) stands in for the business-wide Google link.
  const own = qr.target_url && qr.target_url.startsWith("https://") ? qr.target_url : null;
  const links: FeedbackTarget["links"] = [];
  let usedOwn = false;
  for (const s of saved) {
    if (s.platform === "google" && own) {
      if (usedOwn) continue;
      links.push({ platform: "google", label: "", url: own });
      usedOwn = true;
    } else {
      links.push({ platform: s.platform, label: s.label ?? "", url: s.url });
    }
  }
  if (own && !usedOwn) links.unshift({ platform: "google", label: "", url: own });
  if (!links.length) return null;
  if (!qr.tenant_id) hospitality = tenantKind({ name: business }) === "hospitality";
  return {
    qrId: qr.id,
    tenantId: qr.tenant_id,
    business: business || "us",
    links,
    brand,
    hospitality,
  };
}

function buttonText(l: FeedbackTarget["links"][number]): string {
  if (l.platform === "other") return l.label ? `Review us on ${l.label}` : "Leave a review";
  return `Review us on ${PLATFORMS[l.platform].name}`;
}

const STYLE = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6faf9;color:#0b1b33}
${READING_STYLE}
main{max-width:30rem;margin:0 auto;padding:24px 20px 32px}
.tools{display:flex;justify-content:flex-end;margin:0 0 16px}
h1{font-size:1.6rem;line-height:1.25;margin:0 0 10px}p{margin:0 0 16px;color:#334155}
.steps{margin:0 0 20px;padding-left:1.4em;color:#334155}.steps li{margin:0 0 4px;padding-left:4px}
.btn{display:flex;align-items:center;justify-content:center;min-height:56px;width:100%;text-align:center;text-decoration:none;font-weight:700;border-radius:14px;padding:14px 16px;font-size:1.15rem;margin:0 0 12px}
.alt{display:flex;align-items:center;justify-content:center;min-height:52px;text-align:center;text-decoration:none;font-weight:700;border:2px solid #64748b;border-radius:12px;padding:10px 14px;margin:0 0 10px;color:#0b1b33;background:#fff}
.small{font-size:1rem;color:#334155}
details{margin-top:24px;background:#fff;border:1px solid #94a3b8;border-radius:14px;padding:4px 16px}
summary{cursor:pointer;font-weight:700;min-height:48px;display:flex;align-items:center;padding:8px 0}
label{display:block;font-size:1rem;font-weight:700;margin:16px 0 6px}
input,textarea{width:100%;font:inherit;border:2px solid #64748b;border-radius:10px;padding:12px;background:#fff;color:#0b1b33;min-height:48px}
textarea{min-height:130px}
button[type=submit]{margin:16px 0 12px;min-height:52px;width:100%;font:inherit;font-weight:700;border:0;border-radius:12px;padding:12px;background:#0b1b33;color:#fff;cursor:pointer}
.hp{position:absolute;left:-9999px}
footer{text-align:center;margin-top:28px}footer a{display:inline-flex;align-items:center;min-height:44px;color:#475569;font-size:.95rem}
.ok{background:#ecfdf5;border:2px solid #047857;border-radius:14px;padding:14px 16px;color:#064e3b;margin-bottom:20px;font-weight:600}
.bad{background:#fef2f2;border-color:#b91c1c;color:#7f1d1d}
`;
// The page heading, escaped.
export function greeting(t: Pick<FeedbackTarget, "business" | "hospitality">): string {
  return `${t.hospitality ? "Thanks for visiting" : "Thanks for choosing"} ${esc(t.business)}`;
}

// A personal review-request token (from /q/<token>) carried on the page, so
// a tap on a review site and private feedback can stop that customer's reminders.
export function requestToken(v: unknown): string | null {
  const s = String(v ?? "");
  return /^[A-Za-z0-9_-]{10,40}$/.test(s) ? s : null;
}

export function renderFeedbackPage(
  t: FeedbackTarget,
  note?: "sent" | "error",
  rq?: string | null,
): string {
  // With a request token, review buttons go through /q/<token>?click=<n> so
  // the tap is recorded, then straight on to the review site.
  const hrefFor = (i: number, url: string) =>
    rq ? `/q/${rq}?click=${i}&amp;qr=${t.qrId}` : esc(url);
  const [first, ...rest] = t.links;
  const name = esc(t.business);
  const primary = first
    ? `<a class="btn" style="background:${PLATFORMS[first.platform].colour};color:${PLATFORMS[first.platform].text}" href="${hrefFor(0, first.url)}" rel="noopener">${esc(buttonText(first))}</a>`
    : "";
  const others = rest.length
    ? `<p class="small" style="margin-top:16px">Or, if you prefer:</p>` +
      rest
        .map(
          (l, i) =>
            `<a class="alt" href="${hrefFor(i + 1, l.url)}" rel="noopener">${esc(buttonText(l))}</a>`,
        )
        .join("")
    : "";
  // Brand colours: a bar with the business name and the private-message button.
  const bc = t.brand?.primary ?? null;
  const bcText = bc ? textOn(bc) : "#ffffff";
  const bar = bc
    ? `<header style="background:${bc};color:${bcText};padding:14px 20px;text-align:center;font-weight:800;letter-spacing:.02em${t.brand?.secondary ? `;border-bottom:4px solid ${t.brand.secondary}` : ""}">${name}</header>`
    : "";
  const banner =
    note === "sent"
      ? `<div class="ok" role="status">Thank you. Your message has been passed to ${name}.</div>`
      : note === "error"
        ? `<div class="ok bad" role="alert">Sorry, your message did not send. Check you have written a message below, then tap Send privately again.</div>`
        : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="/favicon.ico?v=2" sizes="any"><link rel="icon" href="/favicon.png?v=2" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review ${name}</title><meta property="og:title" content="Leave ${name} a quick review"><meta property="og:description" content="It takes about 30 seconds. Thank you!"><meta property="og:image" content="https://repsuites.com/og-image.png?v=2"><meta name="robots" content="noindex">
${READING_HEAD}<style>${STYLE}</style></head><body>${bar}<main>
<div class="tools">${readingToggle()}</div>
${banner}
<h1>${greeting(t)}</h1>
<p>Your review helps other people find us. It takes about a minute.</p>
<ol class="steps"><li>Tap the button below.</li><li>Give your rating and a few words.</li><li>Tap Post.</li></ol>
${primary}${others}
<details${note === "error" ? " open" : ""}>
<summary>Want to tell us something privately?</summary>
<p class="small" style="margin-top:10px">This goes straight to the team at ${name}. It does not replace a public review.</p>
<form method="post">
<label for="m">Your message (needed)</label><textarea id="m" name="message" required minlength="2" maxlength="2000"${note === "error" ? ' aria-invalid="true"' : ""}></textarea>
<label for="n">Your name (optional)</label><input id="n" name="name" maxlength="120" autocomplete="name">
<label for="c">Email or phone for a reply (optional)</label><input id="c" name="contact" maxlength="200" autocomplete="email">
<input class="hp" tabindex="-1" autocomplete="off" name="website" aria-hidden="true" aria-label="Leave this empty">${rq ? `<input type="hidden" name="rq" value="${rq}">` : ""}
<button type="submit"${bc ? ` style="background:${bc};color:${bcText}"` : ""}>Send privately</button>
</form></details>
<footer><a href="https://repsuites.com">Powered by RepSuites</a></footer>
</main></body></html>`;
}

export function notFoundPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="/favicon.ico?v=2" sizes="any"><link rel="icon" href="/favicon.png?v=2" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RepSuites</title><style>${STYLE}</style></head><body><main><h1>Thanks for scanning</h1><p>This review code is not active at the moment. Please ask the business for their review link.</p><footer><a href="https://repsuites.com">RepSuites</a></footer></main></body></html>`;
}

// Save private feedback and tell the owners. Returns false on bad input.
export async function savePrivateFeedback(t: FeedbackTarget, form: FormData): Promise<boolean> {
  const str = (k: string, max: number) =>
    String(form.get(k) ?? "")
      .trim()
      .slice(0, max);
  if (str("website", 200)) return true; // bot: pretend it worked
  const message = str("message", 2000);
  if (message.length < 2 || !t.tenantId) return false;
  // At most 20 private messages an hour per code, to stop floods.
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const recent = await serviceRead<{ id: string }[]>(
    `private_feedback?select=id&qr_id=eq.${t.qrId}&created_at=gte.${hourAgo}&limit=21`,
    "",
  );
  if ((recent.data?.length ?? 0) >= 20) return false;
  const name = str("name", 120) || null;
  const contact = str("contact", 200) || null;
  const w = await serviceWrite<unknown>("private_feedback", "", {
    method: "POST",
    body: { tenant_id: t.tenantId, qr_id: t.qrId, name, contact, message },
  });
  if (w.error) return false;
  const rq = requestToken(form.get("rq"));
  if (rq) {
    const { recordRequestFeedback } = await import("./review-requests.server");
    await recordRequestFeedback(rq, t.tenantId).catch(() => null);
  }
  const owners = await serviceWrite<string[]>("rpc/repsuites_owner_emails", "", {
    method: "POST",
    body: { p_tenant: t.tenantId },
  });
  const html =
    `<p>Someone sent private feedback to <b>${esc(t.business)}</b> from your review QR code.</p>` +
    `<blockquote style="border-left:3px solid #cbd5e1;margin:0;padding:4px 12px">${esc(message).replace(/\n/g, "<br>")}</blockquote>` +
    `<p>From: ${esc(name ?? "not given")}<br>Contact: ${esc(contact ?? "not given")}</p>` +
    `<p><a href="https://repsuites.com/dashboard">Open RepSuites</a></p>`;
  const { confirmedOnly } = await import("./email-check.server");
  for (const to of (await confirmedOnly(owners.data ?? [])).slice(0, 5)) {
    await sendEmail({
      to,
      subject: `Private feedback for ${t.business}`,
      html,
      ...(contact && /@/.test(contact) ? { replyTo: contact } : {}),
    });
  }
  return true;
}
