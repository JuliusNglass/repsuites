// Server functions for "Plan my month" (AI-written Google posts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { approveGooglePosts, editGooglePost, planGooglePosts } from "./post-plan.server";

export const planGooglePostsFn = createServerFn({ method: "POST" }).handler(async () =>
  planGooglePosts(),
);

export const approveGooglePostsFn = createServerFn({ method: "POST" }).handler(async () =>
  approveGooglePosts(),
);

export const editGooglePostFn = createServerFn({ method: "POST" })
  .validator((d: { id: string; summary: string }) =>
    z.object({ id: z.string().uuid(), summary: z.string().max(1500) }).parse(d),
  )
  .handler(async ({ data }) => editGooglePost(data));
