// Thin server-function wrappers for local ranking checks.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  addRankKeyword,
  checkRankNow,
  readRanking,
  removeRankKeyword,
  saveRankSettings,
} from "./rank-tracking.server";

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const getRankingFn = createServerFn({ method: "GET" }).handler(async () => readRanking());
export const saveRankSettingsFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({ enabled: z.boolean(), gridSize: z.number().int(), spacingKm: z.number() })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }) => saveRankSettings(data));
export const addRankKeywordFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({ keyword: z.string().max(100) })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }) => addRankKeyword(data));
export const removeRankKeywordFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: UUID }).strict().parse(d))
  .handler(async ({ data }) => removeRankKeyword(data));
export const checkRankNowFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: UUID }).strict().parse(d))
  .handler(async ({ data }) => checkRankNow(data));
