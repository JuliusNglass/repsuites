// Server functions for the AI search visibility check.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readAiVisibility, runAiVisibility } from "./ai-visibility.server";

export const getAiVisibilityFn = createServerFn({ method: "POST" }).handler(async () =>
  readAiVisibility(),
);

export const runAiVisibilityFn = createServerFn({ method: "POST" })
  .validator((d: { service: string; town: string }) =>
    z.object({ service: z.string().max(120), town: z.string().max(120) }).parse(d),
  )
  .handler(async ({ data }) => runAiVisibility(data));
