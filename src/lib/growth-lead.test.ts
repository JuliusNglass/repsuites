import { describe, expect, it } from "vitest";
import { route, validate, bookingUrl, bookPageUrl } from "./growth-lead";

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

describe("pushGhl tags", () => {
  it("adds tags after the upsert instead of replacing them", async () => {
    const { pushGhl, route } = await import("./growth-lead");
    const calls: { url: string; body: string }[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (u: string, init: RequestInit) => {
      calls.push({ url: String(u), body: String(init.body) });
      return new Response(JSON.stringify({ contact: { id: "c1" } }));
    }) as typeof fetch;
    const d = validate(form(good));
    const ok = await pushGhl("t", d, route(d));
    globalThis.fetch = orig;
    expect(ok).toBe(true);
    expect(calls[0]?.body).not.toContain('"tags"');
    expect(calls[1]?.url).toContain("/contacts/c1/tags");
    expect(calls[1]?.body).toContain("grw-lead");
  });
});

describe("growth video and booking", () => {
  it("buckets watch percent", () => {
    const f = form(good);
    f.set("vw", "63");
    expect(validate(f)?.vw).toBe(50);
    f.set("vw", "abc");
    expect(validate(f)?.vw).toBe(0);
  });
  it("sends qualified owners to the branded book page", () => {
    expect(bookPageUrl(validate(form(good)))).toMatch(
      /^https:\/\/growth\.accelur8clientwork\.com\/book\?first_name=Sarah/,
    );
  });
});

describe("leadAlert", () => {
  it("builds a tap-to-call alert with the key answers, escaped", async () => {
    const { leadAlert } = await import("./growth-lead");
    const d = {
      name: "Sam <b>Lee",
      business: "Sparkle & Co",
      phone: "+44 7700 900123",
      email: "s@x.com",
      cleaners: "4-10",
      bottleneck: "hiring",
      timing: "now",
      vw: 75,
      src: "meta",
    };
    const a = leadAlert(d, { qualified: true, phaseKey: "hiring", solo: false, research: false });
    expect(a.subject).toContain("Sparkle & Co");
    expect(a.text).toContain("tel:+447700900123");
    expect(a.text).toContain("Video watched: 75%");
    expect(a.html).not.toContain("<b>Lee");
    expect(a.html).toContain("Sparkle &#38; Co");
  });
});
