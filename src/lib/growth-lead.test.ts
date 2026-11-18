import { describe, expect, it } from "vitest";
import { route, validate, bookingUrl } from "./growth-lead";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const good = {
  name: "Sarah Jones",
  email: "sarah@example.com",
  phone: "07700 900123",
  business: "Sparkle Clean",
  cleaners: "4-10",
  split: "mostdom",
  bottleneck: "commercial",
  ready: "yes",
  timing: "now",
};

describe("growth lead", () => {
  it("routes commercial-ready teams to the commercial phase and qualifies them", () => {
    expect(route(good)).toMatchObject({ qualified: true, phaseKey: "commercial" });
  });
  it("sends commercial owners who must hire first to hiring", () => {
    expect(route({ ...good, ready: "hire" }).phaseKey).toBe("hiring");
  });
  it("does not qualify solo owners or researchers", () => {
    expect(route({ ...good, cleaners: "solo" }).qualified).toBe(false);
    expect(route({ ...good, timing: "research" }).qualified).toBe(false);
  });
  it("rejects missing answers and accepts a full form", () => {
    expect(validate(form({ ...good, timing: "" }))).toBeNull();
    expect(validate(form(good))?.email).toBe("sarah@example.com");
  });
  it("prefills the booking link", () => {
    expect(bookingUrl(validate(form(good)))).toContain("first_name=Sarah");
  });
});

describe("validate tracking fields", () => {
  it("keeps a safe event id and the fbp cookie", () => {
    const d = validate(form({ ...good, eid: "ab12-<x>", fbp: "fb.1.1.2" }));
    expect(d.eid).toBe("ab12-x");
    expect(d.fbp).toBe("fb.1.1.2");
  });
});
