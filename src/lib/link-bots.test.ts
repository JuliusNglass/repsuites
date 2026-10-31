import { describe, expect, it } from "vitest";
import { isLinkBot } from "./link-bots";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

describe("isLinkBot", () => {
  it("lets real browsers through", () => {
    expect(isLinkBot("GET", IPHONE)).toBe(false);
    expect(isLinkBot("GET", ANDROID_CHROME)).toBe(false);
    // Facebook's in-app browser is a person, not the preview crawler.
    expect(isLinkBot("GET", `${ANDROID_CHROME} [FB_IAB/FB4A;FBAV/400.0.0.0;]`)).toBe(false);
  });

  it("skips HEAD requests and empty user agents", () => {
    expect(isLinkBot("HEAD", IPHONE)).toBe(true);
    expect(isLinkBot("GET", "")).toBe(true);
    expect(isLinkBot("GET", null)).toBe(true);
  });

  it("skips link-preview bots", () => {
    for (const ua of [
      "WhatsApp/2.23.20.0 A",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Facebot",
      "Twitterbot/1.0",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "TelegramBot (like TwitterBot)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
      "Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
      "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Applebot/0.1",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Iframely/1.3.1",
      "Mozilla/5.0 (compatible; Embedly/0.2)",
      "Pinterest/0.2 (+https://www.pinterest.com/bot.html)",
      "redditbot/1.0",
      "vkShare; +http://vk.com/dev/Share",
      "W3C_Validator/1.3",
      "Some Link Preview Service",
      "AhrefsCrawler",
      "Baiduspider",
      "Mozilla/5.0 (compatible; Some bot)",
      "python-requests/2.31.0",
      "curl/8.4.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
    ])
      expect(isLinkBot("GET", ua), ua).toBe(true);
  });

  it("does not match 'bot' inside another word", () => {
    expect(isLinkBot("GET", `${IPHONE} Robotics/1.0`)).toBe(false);
  });
});
