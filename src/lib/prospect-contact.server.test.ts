import { afterEach, describe, expect, it, vi } from "vitest";
import { safeSiteUrl, scanSite } from "./prospect-contact.server";

const page = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html", ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe("scanSite", () => {
  it("follows a redirect, then reads the contact page when the home page has no email", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url === "http://sparkle.co.uk/")
          return page("", 301, { location: "https://www.sparkle.co.uk/" });
        if (url === "https://www.sparkle.co.uk/")
          return page(
            `<a href="/contact-us">Contact us</a><a href="https://facebook.com/sparkleclean">f</a>`,
          );
        if (url === "https://www.sparkle.co.uk/contact-us")
          return page(`<p>Email: jayne@gmail.com or info@sparkle.co.uk</p>`);
        return page("", 404);
      }),
    );
    const budget = { left: 24 };
    const r = await scanSite("http://sparkle.co.uk/", budget);
    expect(r.email).toBe("info@sparkle.co.uk");
    expect(r.emails).toEqual(["info@sparkle.co.uk", "jayne@gmail.com"]);
    expect(r.facebook).toBe("https://facebook.com/sparkleclean");
    expect(calls).toHaveLength(3);
    expect(budget.left).toBe(21);
  });
  it("stops when the budget runs out and skips unsafe addresses", async () => {
    const f = vi.fn(async () => page("<p>info@x.co.uk</p>"));
    vi.stubGlobal("fetch", f);
    expect((await scanSite("https://x.co.uk/", { left: 0 })).email).toBe("");
    expect(f).not.toHaveBeenCalled();
    expect(safeSiteUrl("http://localhost:3000/")).toBe("");
    expect(safeSiteUrl("http://10.0.0.1/")).toBe("");
    expect(safeSiteUrl("https://bob.co.uk/")).toBe("https://bob.co.uk/");
  });
});
