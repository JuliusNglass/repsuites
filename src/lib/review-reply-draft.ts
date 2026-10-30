// Drafts a reply to a Google review for the owner to check and post.
//
// Each business can write its own templates for good (4 to 5 stars), middling
// (3) and poor (1 to 2) reviews, with {name}, {business} and {stars} filled
// in. With an ANTHROPIC_API_KEY set on the server, Claude writes the draft in
// the style of the business's template and its "about us" note; without
// one, the template is used as it is.
// No em dashes in any text (AGENTS.md).

export interface ReviewForDraft {
  business: string;
  reviewer: string;
  stars: number;
  comment: string;
}

export interface ReplyTemplates {
  positive: string;
  neutral: string;
  negative: string;
  about: string;
}

export const DEFAULT_TEMPLATES: ReplyTemplates = {
  positive:
    "Hi {name}, thank you so much for your {stars}-star review. We are really glad you are happy, and we will pass your kind words on to the team. We look forward to seeing you again. The {business} team",
  neutral:
    "Hi {name}, thank you for your feedback. We are glad parts of your experience went well, and we would love to hear what we could do better. Please get in touch with us directly. The {business} team",
  negative:
    "Hi {name}, we are sorry we did not meet your expectations, and thank you for telling us. We would like to put this right, so please contact us directly so we can talk it through. The {business} team",
  about: "",
};

export function firstName(reviewer: string): string {
  const f = reviewer.trim().split(/\s+/)[0] ?? "";
  // Google shows "A Google user" for people who hide their name.
  if (!f || /^a$/i.test(f) || f.length > 30) return "";
  return f.charAt(0).toUpperCase() + f.slice(1);
}

const noDash = (s: string) => s.replace(/\s*[—–]\s*/g, " - ");

export function templateFor(stars: number, t: ReplyTemplates = DEFAULT_TEMPLATES): string {
  const pick = stars >= 4 ? t.positive : stars === 3 ? t.neutral : t.negative;
  const fallback =
    stars >= 4
      ? DEFAULT_TEMPLATES.positive
      : stars === 3
        ? DEFAULT_TEMPLATES.neutral
        : DEFAULT_TEMPLATES.negative;
  return pick.trim() || fallback;
}

export function fillTemplate(template: string, r: ReviewForDraft): string {
  const name = firstName(r.reviewer) || "there";
  return noDash(
    template
      .replace(/\{name\}/g, name)
      .replace(/\{business\}/g, r.business || "our")
      .replace(/\{stars\}/g, String(r.stars))
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function templateReply(r: ReviewForDraft, t: ReplyTemplates = DEFAULT_TEMPLATES): string {
  return fillTemplate(templateFor(r.stars, t), r);
}

export async function draftReviewReply(
  r: ReviewForDraft,
  t: ReplyTemplates = DEFAULT_TEMPLATES,
): Promise<string> {
  const key = (process.env["REPSUITES_ANTHROPIC_API_KEY"] ?? "").trim();
  if (!key) return templateReply(r, t);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: (process.env["REPSUITES_ANTHROPIC_MODEL"] ?? "").trim() || "claude-haiku-5-5",
        max_tokens: 300,
        system:
          "You write short replies from a UK business to its Google reviews. British English, warm and professional, " +
          "40 to 110 words, no emojis, no em dashes, no hashtags, no promises of refunds or discounts, never mention software or AI. " +
          "Use the reviewer's first name if given. Thank them, respond to what they actually said, and for 3 stars or fewer apologise " +
          "and invite them to contact the business directly. Follow the tone and sign-off of the business's own template. " +
          "Reply with the reply text only.",
        messages: [
          {
            role: "user",
            content:
              `Business: ${r.business}\n` +
              (t.about.trim() ? `About the business: ${t.about.trim()}\n` : "") +
              `The business's own template for this kind of review: ${fillTemplate(templateFor(r.stars, t), r)}\n\n` +
              `Reviewer: ${r.reviewer}\nStars: ${r.stars}\nReview: ${r.comment || "(no text, stars only)"}`,
          },
        ],
      }),
    });
    if (!res.ok) return templateReply(r, t);
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (body.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    return text && text.length <= 4000 ? noDash(text) : templateReply(r, t);
  } catch {
    return templateReply(r, t);
  }
}
