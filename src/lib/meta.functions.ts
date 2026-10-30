// Server functions for the Facebook and Instagram connection (Posts tab).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  chooseMetaPage,
  disconnectMeta,
  metaConnectUrl,
  readMeta,
  readPostChannels,
  setPostChannels,
} from "./meta.server";

export const getMetaFn = createServerFn({ method: "POST" }).handler(async () => readMeta());

export const metaConnectFn = createServerFn({ method: "POST" }).handler(async () =>
  metaConnectUrl(),
);

export const chooseMetaPageFn = createServerFn({ method: "POST" })
  .validator((d: { pageId: string }) => z.object({ pageId: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => chooseMetaPage(data));

export const disconnectMetaFn = createServerFn({ method: "POST" }).handler(async () =>
  disconnectMeta(),
);

export const getPostChannelsFn = createServerFn({ method: "POST" }).handler(async () =>
  readPostChannels(),
);

export const setPostChannelsFn = createServerFn({ method: "POST" })
  .validator((d: { id: string; facebook: boolean; instagram: boolean }) =>
    z.object({ id: z.string().max(40), facebook: z.boolean(), instagram: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => setPostChannels(data));
