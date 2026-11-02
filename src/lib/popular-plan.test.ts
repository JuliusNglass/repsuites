import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({
  result: { data: [] as unknown, error: null as string | null },
  calls: [] as string[],
}));
vi.mock("./supabase-service.server", () => ({
  serviceWrite: vi.fn(async (endpoint: string) => {
    rpc.calls.push(endpoint);
    return rpc.result;
  }),
}));

import { pickPopularPlan, POPULAR_MIN_PAID } from "./popular-plan";
import { popularPlan, resetPopularPlanCache } from "./popular-plan.server";

const rows = (o: Record<string, number>) =>
  Object.entries(o).map(([plan, subscriptions]) => ({ plan, subscriptions }));

describe("pickPopularPlan", () => {
  it("needs at least 5 active paid subscriptions in total", () => {
    expect(POPULAR_MIN_PAID).toBe(5);
    expect(pickPopularPlan([])).toBeNull();
    expect(pickPopularPlan(rows({ gold: 4 }))).toBeNull();
    expect(pickPopularPlan(rows({ gold: 3, managed: 1 }))).toBeNull();
    expect(pickPopularPlan(rows({ gold: 5 }))).toBe("gold");
    expect(pickPopularPlan(rows({ gold: 4, managed: 1 }))).toBe("gold");
  });

  it("gives no badge on a tie for first place", () => {
    expect(pickPopularPlan(rows({ gold: 3, managed: 3 }))).toBeNull();
    expect(pickPopularPlan(rows({ gold: 10, managed: 10, pro: 2 }))).toBeNull();
    // A tie with an older plan id counts too.
    expect(pickPopularPlan(rows({ gold: 4, pro: 4 }))).toBeNull();
  });

  it("badges a clear leader", () => {
    expect(pickPopularPlan(rows({ gold: 4, managed: 3 }))).toBe("gold");
    expect(pickPopularPlan(rows({ gold: 2, managed: 6 }))).toBe("managed");
    expect(pickPopularPlan(rows({ gold: 3, managed: 2, pro: 1, starter: 1 }))).toBe("gold");
  });

  it("gives no badge when the leader is an older plan not on the prices page", () => {
    expect(pickPopularPlan(rows({ pro: 6, gold: 2 }))).toBeNull();
  });

  it("ignores junk rows and adds up repeated plan ids", () => {
    const junk = [
      { plan: "", subscriptions: 9 },
      { plan: "managed", subscriptions: -3 },
      { plan: "managed", subscriptions: Number.NaN },
      { plan: "gold", subscriptions: 2 },
      { plan: "gold", subscriptions: 3 },
    ];
    expect(pickPopularPlan(junk)).toBe("gold");
    expect(pickPopularPlan([{ plan: "gold", subscriptions: "5" as unknown as number }])).toBe(
      "gold",
    );
  });
});

describe("popularPlan (server)", () => {
  beforeEach(() => {
    resetPopularPlanCache();
    rpc.calls = [];
  });
  afterEach(() => resetPopularPlanCache());

  it("reads counts through the service-role function and caches them", async () => {
    rpc.result = { data: rows({ gold: 2, managed: 4 }), error: null };
    expect(await popularPlan(1_000)).toBe("managed");
    expect(await popularPlan(2_000)).toBe("managed");
    expect(rpc.calls).toEqual(["rpc/repsuites_paid_plan_counts"]);
    // After 10 minutes it asks again.
    rpc.result = { data: rows({ gold: 2, managed: 2 }), error: null };
    expect(await popularPlan(1_000 + 10 * 60_000)).toBeNull();
    expect(rpc.calls).toHaveLength(2);
  });

  it("shows no badge when the count cannot be read", async () => {
    rpc.result = { data: null, error: "upstream_404" };
    expect(await popularPlan(1_000)).toBeNull();
    // Tries again after a minute, not ten.
    rpc.result = { data: rows({ gold: 6 }), error: null };
    expect(await popularPlan(30_000)).toBeNull();
    expect(await popularPlan(62_000)).toBe("gold");
  });
});
