// Server functions for review requests.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  addRequests,
  markRequestSent,
  readRequests,
  saveRequestSettings,
  stopRequest,
} from "./review-requests.server";

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const CHANNEL = z.enum(["whatsapp", "sms", "email"]);

export const getRequestsFn = createServerFn({ method: "POST" }).handler(async () => readRequests());

export const addRequestsFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        people: z
          .array(
            z.object({
              name: z.string().max(120),
              phone: z.string().max(40).nullable(),
              email: z.string().max(320).nullable(),
              channel: CHANNEL,
            }),
          )
          .min(1)
          .max(200),
        sendNow: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => addRequests(data));

export const markSentFn = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => z.object({ id: UUID }).parse(d))
  .handler(async ({ data }) => markRequestSent(data.id));

export const stopRequestFn = createServerFn({ method: "POST" })
  .validator((d: { id: string; remove: boolean }) =>
    z.object({ id: UUID, remove: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => stopRequest(data.id, data.remove));

export const saveRequestSettingsFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        countryCode: z.string().regex(/^[0-9]{1,4}$/),
        firstDelayHours: z.number().int().min(0).max(168),
        reminderDays: z.number().int().min(1).max(30),
        maxReminders: z.number().int().min(0).max(2),
        message: z
          .string()
          .trim()
          .min(10)
          .max(600)
          .refine((s) => s.includes("{link}"), {
            message: "Keep {link} in the message",
          }),
        reminderMessage: z
          .string()
          .trim()
          .min(10)
          .max(600)
          .refine((s) => s.includes("{link}"), {
            message: "Keep {link} in the reminder",
          }),
        emailSubject: z.string().trim().min(3).max(150),
      })
      .parse(d),
  )
  .handler(async ({ data }) => saveRequestSettings(data));
