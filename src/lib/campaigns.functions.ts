// Server functions for "Ask past customers" campaigns.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { previewCampaign, readCampaigns, startCampaign, updateCampaign } from "./campaigns.server";

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const CONTACTS = z
  .array(
    z.object({
      name: z.string().max(120),
      email: z.string().max(320).nullable(),
      phone: z.string().max(40).nullable(),
      lastJobDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
    }),
  )
  .min(1)
  .max(5000);

export const getCampaignsFn = createServerFn({ method: "POST" }).handler(async () =>
  readCampaigns(),
);

export const previewCampaignFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ contacts: CONTACTS }).parse(d))
  .handler(async ({ data }) => previewCampaign(data.contacts));

export const startCampaignFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        contacts: CONTACTS,
        dailyRate: z.number().int().min(10).max(100),
        message: z
          .string()
          .trim()
          .min(10)
          .max(600)
          .refine((s) => s.includes("{link}"), { message: "Keep {link} in the message" }),
        emailSubject: z.string().trim().min(3).max(150),
        lawfulBasis: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => startCampaign(data));

export const updateCampaignFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: UUID,
        status: z.enum(["running", "paused", "stopped"]).optional(),
        dailyRate: z.number().int().min(10).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => updateCampaign(data));
