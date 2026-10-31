import { describe, expect, it } from "vitest";
import { embedUrl, parseVideoLink, videoMessage, watchLabel, rankingHook } from "./prospect-video";

describe("video links", () => {
  it("reads Loom share links", () => {
    const v = parseVideoLink("https://www.loom.com/share/0123456789abcdef0123456789abcdef?sid=x");
    expect(v).toMatchObject({ kind: "loom", id: "0123456789abcdef0123456789abcdef" });
    expect(embedUrl("loom", v!.url)).toContain("loom.com/embed/0123456789abcdef");
  });
  it("reads YouTube links in their usual shapes", () => {
    for (const u of [
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
    ])
      expect(parseVideoLink(u)?.id).toBe("dQw4w9WgXcQ");
    expect(embedUrl("youtube", "https://youtu.be/dQw4w9WgXcQ")).toContain(
      "youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });
  it("keeps the private hash of unlisted Vimeo videos", () => {
    const v = parseVideoLink("https://vimeo.com/123456789/abcdef1234");
    expect(v).toMatchObject({ kind: "vimeo", id: "123456789", hash: "abcdef1234" });
    expect(embedUrl("vimeo", v!.url)).toContain("player.vimeo.com/video/123456789?h=abcdef1234");
  });
  it("turns down other links", () => {
    expect(parseVideoLink("https://example.com/video.mp4")).toBeNull();
    expect(parseVideoLink("not a link")).toBeNull();
    expect(embedUrl("file", "https://x/y.mp4")).toBeNull();
  });
});

describe("watch label and message", () => {
  it("says how much they watched", () => {
    expect(watchLabel(null, 0)).toBe("");
    expect(watchLabel("2026-10-31T10:00:00Z", 0)).toBe("Played the video");
    expect(watchLabel("2026-10-31T10:00:00Z", 75)).toBe("Watched 75%");
    expect(watchLabel("2026-10-31T10:00:00Z", 100)).toBe("Watched it all");
  });
  it("writes a short personal message, with STOP for email", () => {
    const p = { name: "Test Cafe", contactName: "Sam Jones", topFix: "No phone number." };
    expect(videoMessage(p, "https://repsuites.com/r/x")).toBe(
      "Hi Sam, I recorded a quick 90-second video about Test Cafe on Google. No phone number. Watch here: https://repsuites.com/r/x",
    );
    expect(videoMessage(p, "L", true)).toContain("Reply STOP and I won't message again.");
  });
});

describe("rankingHook", () => {
  const ranks = (top: number) => Array.from({ length: 25 }, (_v, i) => (i < top ? 2 : 15));
  it("leads with the weakest map result", () => {
    expect(
      rankingHook([
        { keyword: "car wash", top3: 9, ranks: ranks(9) },
        { keyword: "car valeting", top3: 2, ranks: ranks(2) },
      ]),
    ).toBe(
      'When people near you search "car valeting", you only show in Google\'s top 3 in 2 of the 25 spots we checked around you. Everywhere else, customers see other businesses first.',
    );
  });
  it("says not in any spot when zero", () => {
    expect(rankingHook([{ keyword: "car wash", top3: 0, ranks: ranks(0) }])).toContain(
      "not in Google's top 3 in any of the 25 spots",
    );
  });
  it("is null when strong or unchecked", () => {
    expect(rankingHook([{ keyword: "car wash", top3: 22, ranks: ranks(22) }])).toBeNull();
    expect(rankingHook([])).toBeNull();
  });
});
