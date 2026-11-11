import { describe, expect, it } from "vitest";
import { normalisePhone } from "./meta-capi.server";

describe("normalisePhone", () => {
  it("turns UK numbers into 44 format", () => {
    expect(normalisePhone("07700 900123")).toBe("447700900123");
    expect(normalisePhone("+44 7700 900123")).toBe("447700900123");
  });
});
