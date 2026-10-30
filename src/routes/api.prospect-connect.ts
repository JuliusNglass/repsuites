// A prospect adding their real Google figures to their free report.
// GET ?r=<report token>  -> Google sign-in
// GET ?pick=<sealed>     -> "which business is yours?" page
// POST pick + i          -> save that business's figures
import { createFileRoute } from "@tanstack/react-router";
import { finishPick, pickPage, prospectConnectUrl, readPick } from "../lib/prospect-connect.server";

const go = (to: string, status = 302) =>
  new Response(null, { status, headers: { Location: to, "Cache-Control": "no-store" } });

export const Route = createFileRoute("/api/prospect-connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const pick = u.searchParams.get("pick");
        if (pick) {
          const st = await readPick(pick);
          if (!st) return go("https://repsuites.com/");
          return new Response(pickPage(st, pick), {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
              "Referrer-Policy": "no-referrer",
              "X-Robots-Tag": "noindex",
            },
          });
        }
        return go(await prospectConnectUrl(String(u.searchParams.get("r") ?? "")));
      },
      POST: async ({ request }) => {
        const f = await request.formData().catch(() => null);
        const i = Number(f?.get("i") ?? -1);
        return go(
          await finishPick(String(f?.get("pick") ?? ""), Number.isInteger(i) ? i : -1),
          303,
        );
      },
    },
  },
});
