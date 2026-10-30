// Server functions for the free sign-up page (/start).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { signupPrefill, signUpFree } from "./signup.server";

export const getSignupPrefill = createServerFn({ method: "POST" })
  .validator((d: { r: string }) => z.object({ r: z.string().max(64) }).parse(d))
  .handler(async ({ data }) => signupPrefill(data.r));

export const signUpFreeFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      business: string;
      name: string;
      email: string;
      password: string;
      agree: boolean;
      placeId?: string;
      report?: string;
      website?: string;
    }) =>
      z
        .object({
          business: z.string().max(200),
          name: z.string().max(200),
          email: z.string().max(320),
          password: z.string().max(200),
          agree: z.boolean(),
          placeId: z.string().max(300).optional(),
          report: z.string().max(64).optional(),
          website: z.string().max(200).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => signUpFree(data));
