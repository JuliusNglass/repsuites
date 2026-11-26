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
        // 26 Nov 2026: printed codes are now served by SparkOps (same ID, all
        // codes copied and checked). 302, so this can be switched back.
        if (/^[0-9a-f-]{36}$/.test(id)) {
          const to = new URL(`https://ops.accelur8clientwork.com/feedback/${id}`);
          to.search = new URL(request.url).search;
          return new Response(null, {
            status: 302,
            headers: { Location: to.toString(), "Cache-Control": "no-store" },
          });
        }
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
