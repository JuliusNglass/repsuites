// Link-preview bots and crawlers. WhatsApp, Facebook, iMessage, Slack and
// others fetch a link as soon as it is pasted, which would count as an
// "open" of a report nobody has looked at yet. Pure, so it is easy to test.

const BOT_RE = new RegExp(
  [
    "whatsapp",
    "facebookexternalhit",
    "facebot",
    "twitterbot",
    "slackbot",
    "telegrambot",
    "discordbot",
    "linkedinbot",
    "skypeuripreview",
    "applebot",
    "googlebot",
    "bingbot",
    "iframely",
    "embedly",
    "pinterest",
    "redditbot",
    "vkshare",
    "w3c_validator",
    "preview",
    "crawler",
    "spider",
    "\\bbot\\b",
    "python-requests",
    "curl",
    "headlesschrome",
  ].join("|"),
  "i",
);

// True when the request should not count as a person opening the link:
// a HEAD request, no user agent at all, or a known bot.
export function isLinkBot(method: string, userAgent: string | null | undefined): boolean {
  if (method.toUpperCase() === "HEAD") return true;
  const ua = (userAgent ?? "").trim();
  if (!ua) return true;
  return BOT_RE.test(ua);
}
