// Link-preview bots and crawlers. WhatsApp, Facebook, iMessage, Slack and
// others fetch a link as soon as it is pasted, which would count as an
// "open" of a report nobody has looked at yet. Email security scanners
// (Outlook Safe Links, Mimecast, Proofpoint and others) also follow every link
// in an email before the person sees it, and SEO crawlers wander in too.
// Pure, so it is easy to test.

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
    // Email link scanners.
    "microsoft office",
    "safelinks",
    "mimecast",
    "proofpoint",
    "barracuda",
    "symantec",
    "messagelabs",
    "zscaler",
    // SEO and search crawlers.
    "ahrefsbot",
    "semrushbot",
    "mj12bot",
    "dotbot",
    "petalbot",
    "yandexbot",
    "baiduspider",
    "duckduckbot",
    "preview",
    "crawler",
    "spider",
    // "bot" as a word or at the end of one ("SomethingBot/1.0"), but not
    // inside a word ("Robotics").
    "bot\\b",
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
