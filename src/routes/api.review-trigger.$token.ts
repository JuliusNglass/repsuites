// Inbound trigger for automatic review requests, one secret address per
// business: POST https://repsuites.com/api/review-trigger/<token>
// Body (JSON or a form post from GoHighLevel, Zapier, Make and others):
//   { name, email, phone?, event: "job_done" | "invoice_paid" | "manual", external_id? }
// The request goes out after the business's delay, never in quiet hours.
// Repeats of the same external_id are ignored.
import { createFileRoute } from "@tanstack/react-router";
import { handleTrigger } from "../lib/review-requests.server";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const MAX_BYTES = 20000;

async function readBody(request: Request): Promise<unknown> {
  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_BYTES) return null;
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const f = await new Response(raw, { headers: { "content-type": type } })
      .formData()
      .catch(() => null);
    if (!f) return null;
    const o: Record<string, string> = {};
    f.forEach((v, k) => {
      if (typeof v === "string") o[k] = v;
    });
    return o;
  }
  if (
    type.includes("application/x-www-form-urlencoded") ||
    (!type.includes("json") && raw.includes("=") && !raw.trim().startsWith("{"))
  ) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/review-trigger/$token")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const body = await readBody(request);
        const r = await handleTrigger(String(params.token || ""), body);
        return new Response(JSON.stringify(r.body), { status: r.status, headers: JSON_HEADERS });
      },
      GET: async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: "Send a POST with name, email, phone, event and external_id.",
          }),
          { status: 405, headers: JSON_HEADERS },
        ),
    },
  },
});
