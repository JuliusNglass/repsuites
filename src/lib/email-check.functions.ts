// Server functions for the "confirm your email" bar on the dashboard.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { confirmEmailCode, readEmailCheck, resendEmailCode } from "./email-check.server";

export const getEmailCheckFn = createServerFn({ method: "POST" }).handler(async () =>
  readEmailCheck(),
);

export const confirmEmailCodeFn = createServerFn({ method: "POST" })
  .validator((d: { code: string }) => z.object({ code: z.string().max(12) }).parse(d))
  .handler(async ({ data }) => confirmEmailCode(data.code));

export const resendEmailCodeFn = createServerFn({ method: "POST" }).handler(async () =>
  resendEmailCode(),
);
