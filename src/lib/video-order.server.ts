/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe JSON is checked field by field. */
// Server-only: explainer video orders. One-off Stripe payment, then a brief
// that is emailed to Accelur8 and saved on the GHL contact (tag video-client).
import { crmFetch } from "./crm-store.server";
import { stripe } from "./stripe.server";
import { sendEmail } from "./email.server";
import { VIDEO_PACKS, briefText, type VideoBrief, type VideoPack } from "./video-order";

const ORIGIN = "https://repsuites.com";
const LOCATION_ID = "HzEU9UBWZEzxuB5SSDYE";
const NOTIFY = "julius@accelur8.com";

export async function startVideoOrder(pack: VideoPack) {
  const p = VIDEO_PACKS[pack];
  const s = await stripe<{ url: string }>("checkout/sessions", {
    mode: "payment",
    metadata: { kind: "video_order", pack },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: p.pence,
          product_data: {
            name: `Accelur8 ${p.label}`,
            description:
              "Hand-drawn explainer video with voiceover, captions and music. You approve the script first.",
          },
        },
      },
    ],
    phone_number_collection: { enabled: true },
    custom_text: {
      submit: {
        message:
          "After you pay, you go straight to a short brief about your business and ideal customers.",
      },
    },
    success_url: `${ORIGIN}/videos/brief?s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${ORIGIN}/videos`,
  });
  return s.ok
    ? { ok: true as const, url: s.data.url }
    : { ok: false as const, error: "Checkout is not available right now." };
}

export async function readVideoOrder(id: string) {
  const r = await stripe<any>(`checkout/sessions/${id}`, undefined, "GET");
  const d = r.ok ? r.data : null;
  if (!d || d.metadata?.kind !== "video_order") return null;
  const pack = (d.metadata?.pack === "three" ? "three" : "one") as VideoPack;
  return {
    paid: d.payment_status === "paid",
    pack,
    email: String(d.customer_details?.email ?? ""),
    phone: String(d.customer_details?.phone ?? ""),
    name: String(d.customer_details?.name ?? ""),
  };
}

async function ghl(path: string, body: unknown, token: string) {
  return crmFetch(`${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  }).catch(() => null);
}

export async function saveVideoBrief(sessionId: string, b: VideoBrief) {
  const o = await readVideoOrder(sessionId);
  if (!o) return { ok: false as const, error: "We could not find your order." };
  if (!o.paid)
    return {
      ok: false as const,
      error: "Your payment has not come through yet. Please wait a minute and try again.",
    };
  const text = briefText(b, o.pack, o.email);
  const esc = (s: string) =>
    s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const mail = await sendEmail({
    to: NOTIFY,
    subject: `New video order: ${b.business} (${VIDEO_PACKS[o.pack].label})`,
    html: `<pre style="font:15px/1.5 sans-serif;white-space:pre-wrap">${esc(text)}\n\nStripe session: ${esc(sessionId)}</pre>`,
    text,
    ...(o.email ? { replyTo: o.email } : {}),
    fromName: "Accelur8",
  });
  const token = (process.env["GHL_PRIVATE_TOKEN"] ?? "").trim();
  let saved = false;
  let contactId: string | null = null;
  if (token) {
    const [first, ...rest] = b.name.split(/\s+/);
    const res = await ghl(
      "contacts/upsert",
      {
        locationId: LOCATION_ID,
        firstName: first,
        lastName: rest.join(" "),
        email: o.email || undefined,
        phone: b.phone || o.phone || undefined,
        companyName: b.business,
        website: b.site || undefined,
        source: "Accelur8 explainer videos",
      },
      token,
    );
    const id = res?.ok ? ((await res.json().catch(() => null)) as any)?.contact?.id : null;
    if (id) {
      await ghl(`contacts/${id}/tags`, { tags: ["video-client", `video-pack-${o.pack}`] }, token);
      const n = await ghl(
        `contacts/${id}/notes`,
        { body: `Explainer video brief\n\n${text}` },
        token,
      );
      saved = !!n?.ok;
    }
    contactId = id ?? null;
  }
  if (!mail.ok && !saved)
    return { ok: false as const, error: "We could not save your brief. Please try again." };
  // Write the script and send it for approval. Best effort: the brief is already saved.
  const { startScript } = await import("./video-script.server");
  await startScript({
    sessionId,
    pack: o.pack,
    email: o.email,
    phone: o.phone,
    contactId,
    brief: b,
  }).catch((e) => console.error("video script failed", e));
  return { ok: true as const };
}
