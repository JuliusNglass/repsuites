// Explainer video orders: thin server functions for /videos and /videos/brief.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { applyNoStoreHeaders, verifyRequestOriginAsync } from "./auth.server";
import { stripeReady } from "./stripe.server";
import { VIDEO_SESSION_RE, checkBrief } from "./video-order";

export const videoStart = createServerFn({ method: "POST" })
  .validator((d: { pack: string }) => z.object({ pack: z.enum(["one", "three"]) }).parse(d))
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    if (!stripeReady()) return { ok: false as const, error: "Payments are not open yet." };
    const { startVideoOrder } = await import("./video-order.server");
    return startVideoOrder(data.pack);
  });

export const videoState = createServerFn({ method: "POST" })
  .validator((d: { s: string }) => z.object({ s: z.string().regex(VIDEO_SESSION_RE) }).parse(d))
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    const { readVideoOrder } = await import("./video-order.server");
    const o = await readVideoOrder(data.s);
    if (!o) return { status: "missing" as const };
    if (!o.paid) return { status: "waiting" as const };
    return { status: "ready" as const, pack: o.pack, name: o.name, phone: o.phone };
  });

export const videoBrief = createServerFn({ method: "POST" })
  .validator((d: { s: string; brief: Record<string, string> }) =>
    z
      .object({
        s: z.string().regex(VIDEO_SESSION_RE),
        brief: z.record(z.string(), z.string().max(2000)),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    applyNoStoreHeaders();
    if (!(await verifyRequestOriginAsync()))
      return { ok: false as const, error: "Please refresh the page and try again." };
    const c = checkBrief(data.brief);
    if (!c.ok) return c;
    const { saveVideoBrief } = await import("./video-order.server");
    return saveVideoBrief(data.s, c.brief);
  });
