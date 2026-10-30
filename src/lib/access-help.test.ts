import { describe, expect, it } from "vitest";
import { chaseOn, isAccessStatus } from "./access-help";

describe("chase date", () => {
  it("chases 3 days after the request, then 7", () => {
    expect(chaseOn("request_sent", "2026-11-01", "2026-11-02")).toBe("2026-11-04");
    expect(chaseOn("waiting", "2026-11-01", "2026-11-05")).toBe("2026-11-08");
  });
  it("has nothing to chase when done or not started", () => {
    expect(chaseOn("done", "2026-11-01", "2026-11-02")).toBeNull();
    expect(chaseOn("request_sent", null, "2026-11-02")).toBeNull();
  });
  it("knows the statuses", () => {
    expect(isAccessStatus("video_booked")).toBe(true);
    expect(isAccessStatus("nope")).toBe(false);
  });
});

describe("We do it for you prices", async () => {
  const { planPence, yearSaving, PLAN_FEATURES } = await import("./shop");
  it("is £99 a month or £997 a year", () => {
    expect(planPence("month", "managed")).toBe(9900);
    expect(planPence("year", "managed")).toBe(99700);
    // £99 x 12 = £1,188. £1,188 - £997 = £191 saved.
    expect(yearSaving("managed")).toBe(19100);
    expect(planPence("month")).toBe(4900);
  });
  it("includes everything in Growth", () => {
    for (const f of PLAN_FEATURES.gold) expect(PLAN_FEATURES.managed).toContain(f);
  });
});
