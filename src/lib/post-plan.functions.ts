// Server functions for "Plan my month" (AI-written Google posts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  approveGooglePosts,
  changePostPicture,
  editGooglePost,
  planGooglePosts,
  removePostPicture,
  saveCardPicture,
  listBackgroundPhotos,
  pickGooglePhotoBackground,
} from "./post-plan.server";

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

export const changePostPictureFn = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => changePostPicture(data));

export const removePostPictureFn = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => removePostPicture(data));

export const saveCardPictureFn = createServerFn({ method: "POST" })
  .validator((d: { id: string; png: string }) =>
    z.object({ id: z.string().uuid(), png: z.string().max(6_000_000) }).parse(d),
  )
  .handler(async ({ data }) => saveCardPicture(data));

export const listBackgroundPhotosFn = createServerFn({ method: "POST" }).handler(async () =>
  listBackgroundPhotos(),
);

export const pickGooglePhotoBackgroundFn = createServerFn({ method: "POST" })
  .validator((d: { url: string }) => z.object({ url: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data }) => pickGooglePhotoBackground(data));
