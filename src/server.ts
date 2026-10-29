import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} - try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  request: Request,
  ctx: unknown,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const captured = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(captured);
  recordAppError(request, captured, ctx);
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Best effort: keep a short record of unexpected server errors so the health
// check can alert the agency. Never blocks or changes the response.
function recordAppError(request: Request, error: unknown, ctx: unknown) {
  const task = (async () => {
    try {
      const { serviceWrite, hasServiceRole } = await import("./lib/supabase-service.server");
      if (!hasServiceRole()) return;
      const { describeError } = await import("./lib/error-capture");
      const url = new URL(request.url);
      await serviceWrite<unknown>("rpc/repsuites_record_app_error", "", {
        method: "POST",
        body: {
          p_host: url.host,
          p_path: url.pathname,
          p_message: describeError(error).split("\n").slice(0, 6).join("\n"),
        },
      });
    } catch {
      // never let error reporting cause another error
    }
  })();
  const waitUntil = (ctx as { waitUntil?: (p: Promise<unknown>) => void } | null)?.waitUntil;
  if (typeof waitUntil === "function") waitUntil.call(ctx, task);
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response, request, ctx);
    } catch (error) {
      console.error(error);
      recordAppError(request, error, ctx);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
