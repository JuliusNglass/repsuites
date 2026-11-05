import { afterEach, describe, expect, it, vi } from "vitest";
import { mapsResults } from "./rank-tracking.server";
import { runGrid } from "./prospects.server";
afterEach(() => vi.unstubAllGlobals());
const response = (status = 20000, items: unknown = []) =>
  new Response(
    JSON.stringify({ tasks: [{ status_code: status, result: [{ items }], cost: 0.001 }] }),
  );
describe("provider ranking evidence", () => {
  it("rejects pending and malformed results instead of claiming absence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(20100)),
    );
    expect((await mapsResults("auth", "plumber", 51, 0)).ok).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(20000, null)),
    );
    expect((await mapsResults("auth", "plumber", 51, 0)).ok).toBe(false);
  });
  it("does not publish a grid if even one search failed", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++n === 1 ? response(50000) : response())),
    );
    const result = await runGrid("auth", "plumber", { lat: 51, lng: 0 }, "own", "Own", 1);
    expect(result.grid).toBeNull();
    expect(n).toBe(25);
  });
  it("retains complete competitor comparisons without extra calls", async () => {
    const fetcher = vi.fn(async () =>
      response(20000, [{ type: "maps_search", place_id: "rival", title: "Other", rank_group: 1 }]),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await runGrid("auth", "plumber", { lat: 51, lng: 0 }, "own", "Own", 1);
    expect(result.grid?.competitors?.[0]).toMatchObject({ name: "Other", top3: 25, found: 25 });
    expect(result.grid?.found).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(25);
  });
});
