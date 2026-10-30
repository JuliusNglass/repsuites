// Thin server-function wrappers for Google Business Profile.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  cancelGooglePost,
  chooseGooglePlace,
  createGooglePost,
  disconnectGoogle,
  draftGoogleReply,
  googleConnectUrl,
  listGooglePlaces,
  postGoogleReply,
  readGoogle,
  readInsights,
  refreshInsights,
  refreshGoogleReviews,
  saveGoogleReplySettings,
} from "./google-business.server";

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const getGoogleFn = createServerFn({ method: "GET" }).handler(async () => readGoogle());
export const googleConnectUrlFn = createServerFn({ method: "POST" }).handler(async () =>
  googleConnectUrl(),
);
export const listGooglePlacesFn = createServerFn({ method: "GET" }).handler(async () =>
  listGooglePlaces(),
);
export const disconnectGoogleFn = createServerFn({ method: "POST" }).handler(async () =>
  disconnectGoogle(),
);
export const refreshGoogleReviewsFn = createServerFn({ method: "POST" }).handler(async () =>
  refreshGoogleReviews(),
);

export const chooseGooglePlaceFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        account: z.string().regex(/^accounts\/[0-9]+$/),
        location: z.string().regex(/^locations\/[0-9]+$/),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }) => chooseGooglePlace(data));

export const draftGoogleReplyFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: UUID }).strict().parse(d))
  .handler(async ({ data }) => draftGoogleReply(data));

export const postGoogleReplyFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({ id: UUID, text: z.string().max(4096) })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }) => postGoogleReply(data));

export const createGooglePostFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        summary: z.string().max(1500),
        actionType: z.enum(["BOOK", "LEARN_MORE", "CALL", "SIGN_UP"]).nullable().optional(),
        actionUrl: z.string().max(500).nullable().optional(),
        publishAt: z.string().max(40).nullable().optional(),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }) => createGooglePost(data));

export const cancelGooglePostFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: UUID }).strict().parse(d))
  .handler(async ({ data }) => cancelGooglePost(data));

export const saveGoogleReplySettingsFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        mode: z.enum(["off", "suggest", "auto"]),
        autoMinStars: z.number().int(),
        positive: z.string().max(1500),
        neutral: z.string().max(1500),
        negative: z.string().max(1500),
        about: z.string().max(1000),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }) => saveGoogleReplySettings(data));

export const getGooglePerformanceFn = createServerFn({ method: "GET" }).handler(async () => {
  const { readGooglePerformance } = await import("./google-business.server");
  return readGooglePerformance();
});

export const saveGoogleReportSettingsFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({ enabled: z.boolean(), email: z.string().max(320) })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { saveGoogleReportSettings } = await import("./google-business.server");
    return saveGoogleReportSettings(data);
  });

export const sendTestGoogleReportFn = createServerFn({ method: "POST" }).handler(async () => {
  const { sendTestGoogleReport } = await import("./google-business.server");
  return sendTestGoogleReport();
});

export const getInsightsFn = createServerFn({ method: "GET" }).handler(async () => readInsights());
export const refreshInsightsFn = createServerFn({ method: "POST" }).handler(async () =>
  refreshInsights(),
);
