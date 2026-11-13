import { describe, expect, it } from "vitest";
import { mapGif } from "./map-gif";

describe("map gif", () => {
  it("makes a looping GIF with one frame per spot plus the start", () => {
    const b = mapGif(Array.from({ length: 25 }, (_, i) => (i % 2 ? 1 : null)), 200);
    expect(String.fromCharCode(...b.slice(0, 6))).toBe("GIF89a");
    expect(b.length).toBeGreaterThan(1000);
  });
});
