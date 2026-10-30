import { describe, expect, it } from "vitest";
import { channelText, fbMessage, igCanUse, igCaption, metaError } from "./social";

describe("Instagram caption", () => {
  it("keeps short captions", () => {
    expect(igCaption("Hello #burger")).toBe("Hello #burger");
  });
  it("cuts to 2,200 characters at a word", () => {
    const c = igCaption("word ".repeat(1000));
    expect(c.length).toBeLessThanOrEqual(2200);
    expect(c.endsWith("...")).toBe(true);
  });
  it("keeps at most 30 hashtags", () => {
    const text = Array.from({ length: 35 }, (_, i) => `#tag${i}`).join(" ");
    const c = igCaption(text);
    expect((c.match(/#/g) ?? []).length).toBe(30);
    expect(c).toContain(" tag34");
  });
});

describe("Facebook message", () => {
  it("adds the link once", () => {
    expect(fbMessage("Come in", "https://x.co")).toBe("Come in\n\nhttps://x.co");
    expect(fbMessage("See https://x.co", "https://x.co")).toBe("See https://x.co");
    expect(fbMessage("Hi", "javascript:alert(1)")).toBe("Hi");
  });
});

describe("pictures and status", () => {
  it("Instagram needs a non-PNG https picture", () => {
    expect(igCanUse(null)).toBe(false);
    expect(igCanUse("https://a.co/x.png")).toBe(false);
    expect(igCanUse("https://a.co/x.jpg")).toBe(true);
    expect(igCanUse("https://lh3.googleusercontent.com/abc")).toBe(true);
  });
  it("reads plainly", () => {
    expect(channelText("Facebook", "posted", null)).toBe("Facebook: posted");
    expect(channelText("Instagram", "skipped", "no picture")).toBe(
      "Instagram: not posted (no picture)",
    );
    expect(channelText("Facebook", null, null)).toBe("Facebook: waiting");
  });
  it("explains Meta errors", () => {
    expect(metaError({ error: { code: 190 } }, 400)).toBe("Facebook needs connecting again.");
    expect(metaError(null, 500)).toBe("Facebook could not be reached.");
  });
});
