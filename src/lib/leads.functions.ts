// Free visibility check requests from the public homepage.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { serviceWrite } from "./supabase-service.server";

const Lead = z.object({
  name: z.string().trim().min(2).max(120),
  business: z.string().trim().min(2).max(160),
  town: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(40).optional().default(""),
  // Hidden field. People leave it empty; bots fill it in.
  website: z.string().max(200).optional().default(""),
});

export const requestVisibilityCheck = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof Lead>) => Lead.parse(data))
  .handler(async ({ data }) => {
    if (data.website) return { ok: true as const };
    const w = await serviceWrite<unknown>("leads", "", {
      method: "POST",
      body: {
        name: data.name,
        business_name: data.business,
        town: data.town,
        email: data.email.toLowerCase(),
        phone: data.phone || null,
        source: "homepage_visibility_check",
      },
    });
    if (w.error) return { ok: false as const, error: "Sorry, that did not send. Please try again." };
    return { ok: true as const };
  });
