// Printed RepSuites QR codes point here: /feedback/<ID> (never change this
// address). Shows the business's review buttons (Google and any other sites
// they chose, in their order) plus a private feedback form, and counts the
// scan. The page itself is in feedback-page.server.ts.
import { createFileRoute } from "@tanstack/react-router";
import { serviceWrite } from "../lib/supabase-service.server";
import {
  loadFeedbackTarget,
  notFoundPage,
  renderFeedbackPage,
  requestToken,
  savePrivateFeedback,
} from "../lib/feedback-page.server";

const HTML = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };

function sameSite(request: Request): boolean {
  const o = request.headers.get("origin");
  return !o || /^https:\/\/(www\.)?repsuites\.com$/.test(o);
}

export const Route = createFileRoute("/feedback/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = String(params.id || "").toLowerCase();
        const t = await loadFeedbackTarget(id);
        if (!t) return new Response(notFoundPage(), { status: 404, headers: HTML });
        await serviceWrite("qr_scans", "", { method: "POST", body: { qr_id: id } }).catch(
          () => null,
        );
        const rq = requestToken(new URL(request.url).searchParams.get("rq"));
        return new Response(renderFeedbackPage(t, undefined, rq), { status: 200, headers: HTML });
      },
      POST: async ({ params, request }) => {
        const id = String(params.id || "").toLowerCase();
        const t = await loadFeedbackTarget(id);
        if (!t) return new Response(notFoundPage(), { status: 404, headers: HTML });
        let ok = false;
        let rq: string | null = null;
        if (sameSite(request)) {
          const form = await request.formData().catch(() => null);
          rq = requestToken(form?.get("rq"));
          ok = form ? await savePrivateFeedback(t, form) : false;
        }
        return new Response(renderFeedbackPage(t, ok ? "sent" : "error", rq), {
          status: ok ? 200 : 400,
          headers: HTML,
        });
      },
    },
  },
});
