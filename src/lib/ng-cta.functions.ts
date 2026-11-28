// Records the /ng button wording test (view, click, checkout start). Best effort.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const logNgCta = createServerFn({ method: "POST" })
  .validator((d: { variant: "a" | "b"; kind: "view" | "click" | "start"; price: number }) =>
    z
      .object({
        variant: z.enum(["a", "b"]),
        kind: z.enum(["view", "click", "start"]),
        price: z.number().int().min(0).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { serviceWrite, hasServiceRole } = await import("./supabase-service.server");
    if (!hasServiceRole()) return { ok: false };
    await serviceWrite("ng_cta_events", "", {
      method: "POST",
      body: data,
      headers: { Prefer: "return=minimal" },
    }).catch(() => null);
    return { ok: true };
  });
