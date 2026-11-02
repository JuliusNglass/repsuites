// The prices page asks which plan, if any, has earned "Most popular".
// Only a plan id (or null) is sent to the browser.
import { createServerFn } from "@tanstack/react-start";

export const getPopularPlan = createServerFn({ method: "GET" }).handler(async () => {
  const { popularPlan } = await import("./popular-plan.server");
  return { planId: await popularPlan() };
});
