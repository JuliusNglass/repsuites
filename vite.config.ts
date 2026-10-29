// @leadconnector/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only, jsxSource fallback + tailwind config), @tanstack/devtools-vite source injection (data-tsd-source, dev-only),
//     HMR gate/flush, dev-server bridge controls, server diagnostics, lightningcss, and sandbox detection
//     (secure host allowlist, port/strictPort, watch ignores, and HMR overlay policy).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@leadconnector/vite-tanstack-config";

// REPSUITES_CF_BUILD=1 builds a standalone Cloudflare Worker (npm run build:cf)
// for hosting outside AI Studio. The normal AI Studio build is unchanged.
const cloudflareBuild = process.env["REPSUITES_CF_BUILD"] === "1";

export default defineConfig({
  ...(cloudflareBuild
    ? {
        nitro: {
          preset: "cloudflare-module",
          output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
          cloudflare: {
            nodeCompat: true,
            deployConfig: true,
            wrangler: {
              name: process.env["REPSUITES_CF_WORKER_NAME"] || "repsuites",
              compatibility_date: "2026-09-01",
              observability: { enabled: true },
            },
          },
        },
      }
    : {}),
  // Browser errors stay in the trusted parent-frame console-log flow;
  // do not expose the bridge collector on the public sandbox tunnel.
  devServerBridge: { errorCollector: false },
  // Do not set server.hmr.timeout — Vite 8 deprecated those websocket fields
  // (use server.ws.*). Overlay/host/port are package-owned; default WS timeout is 30s.
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
