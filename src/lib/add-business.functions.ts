// "Add a business" server function (Accelur8 team only).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { agencyGuard } from "./prospects.server";
import { addBusinessProblem, ADD_PLANS } from "./add-business";
import { PLACE_RE } from "./signup";

const PLAN_IDS = ADD_PLANS.map((p) => p.id) as ["free", "gold", "managed"];

export const addClientBusiness = createServerFn({ method: "POST" })
  .validator(
    (d: {
      name: string;
      placeId?: string;
      ownerName?: string;
      ownerEmail?: string;
      plan: string;
    }) =>
      z
        .object({
          name: z.string().max(200),
          placeId: z.string().regex(PLACE_RE).optional().or(z.literal("")),
          ownerName: z.string().max(200).optional(),
          ownerEmail: z.string().max(254).optional(),
          plan: z.enum(PLAN_IDS),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const g = await agencyGuard(true);
    if (!g.ok) return g;
    const problem = addBusinessProblem(data);
    if (problem) return { ok: false as const, error: problem };
    const { addBusiness } = await import("./add-business.server");
    return addBusiness(data, g.userId);
  });
