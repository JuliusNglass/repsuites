import { createServerFn } from "@tanstack/react-start";
import { getSupabaseConfig, describeMissingConfig } from "./config.server";

export const getSystemStatus = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = getSupabaseConfig();
  return { isConfigured: cfg.isConfigured, missingMessage: describeMissingConfig(cfg.missing) };
});
