import { describe, expect, it } from "vitest";
import { emailFromIdToken, reviewRow, validatePost } from "./google-business.server";
import { firstName, templateReply, fillTemplate, DEFAULT_TEMPLATES } from "./review-reply-draft";
import { validateReplySettings } from "./google-business.server";

describe("Google sign-in", () => {
  it("reads the email from the ID token", () => {
    const payload = btoa(JSON.stringify({ email: "owner@example.com" })).replace(/=+$/, "");
    expect(emailFromIdToken(`x.${payload}.y`)).toBe("owner@example.com");
    expect(emailFromIdToken("bad")).toBeNull();
    expect(emailFromIdToken(undefined)).toBeNull();
  });
});

describe("Google reviews", () => {
  it("turns a Google review into a row", () => {
    const r = reviewRow("t", {
      name: "accounts/1/locations/2/reviews/abc",
      reviewer: { displayName: "Jane Smith" },
      starRating: "FOUR",
      comment: "Lovely job",
      createTime: "2026-10-20T10:00:00Z",
      reviewReply: { comment: "Thanks Jane", updateTime: "2026-10-21T10:00:00Z" },
    });
    expect(r).toMatchObject({
      review_name: "accounts/1/locations/2/reviews/abc",
      reviewer: "Jane Smith",
      stars: 4,
      reply: "Thanks Jane",
    });
    expect(reviewRow("t", { name: "x", starRating: "STAR_RATING_UNSPECIFIED" }).stars).toBeNull();
  });
  it("drafts a reply that fits the stars, with no dashes", () => {
    const good = templateReply({
      business: "Crystal Clean",
      reviewer: "Jane Smith",
      stars: 5,
      comment: "Great",
    });
    expect(good).toContain("Hi Jane,");
    expect(good).toContain("5-star");
    expect(good).toContain("The Crystal Clean team");
    const bad = templateReply({
      business: "Crystal Clean",
      reviewer: "A Google user",
      stars: 2,
      comment: "Missed the bathroom",
    });
    expect(bad.startsWith("Hi there,")).toBe(true);
    expect(bad).toMatch(/sorry/);
    for (const t of [good, bad]) expect(t).not.toMatch(/[—–]|RepSuites/);
    expect(firstName("a google user")).toBe("");
  });
});

describe("Google posts", () => {
  it("checks the post before it goes to Google", () => {
    expect(validatePost({ summary: "short" })).toMatch(/10 to 1,500/);
    expect(validatePost({ summary: "Book your autumn deep clean now" })).toBeNull();
    expect(validatePost({ summary: "Call us on 07700 900123 today please" })).toMatch(
      /phone numbers/,
    );
    expect(
      validatePost({
        summary: "Book your autumn deep clean now",
        actionType: "BOOK",
        actionUrl: "",
      }),
    ).toMatch(/web address/);
    expect(
      validatePost({ summary: "Book your autumn deep clean now", actionType: "CALL" }),
    ).toBeNull();
    expect(
      validatePost({
        summary: "Book your autumn deep clean now",
        publishAt: new Date(Date.now() + 120 * 86400000).toISOString(),
      }),
    ).toMatch(/90 days/);
  });
});

describe("reply templates and settings", () => {
  it("uses the business's own template with the gaps filled", () => {
    const t = {
      ...DEFAULT_TEMPLATES,
      positive: "Thanks {name}! {stars} stars from you means a lot. Love, {business}",
    };
    expect(
      templateReply({ business: "Home Again", reviewer: "sam lee", stars: 4, comment: "" }, t),
    ).toBe("Thanks Sam! 4 stars from you means a lot. Love, Home Again");
    // Blank template falls back to the default.
    expect(
      templateReply(
        { business: "X", reviewer: "Sam", stars: 3, comment: "" },
        { ...t, neutral: "  " },
      ),
    ).toContain("thank you for your feedback");
    expect(
      fillTemplate("Hi {name}\u2014thanks", { business: "", reviewer: "", stars: 5, comment: "" }),
    ).toBe("Hi there - thanks");
  });
  it("checks the settings", () => {
    const ok = { mode: "auto", autoMinStars: 4, ...DEFAULT_TEMPLATES };
    expect(validateReplySettings(ok)).toBeNull();
    expect(validateReplySettings({ ...ok, autoMinStars: 1 })).toMatch(/3, 4 or 5/);
    expect(validateReplySettings({ ...ok, positive: "too short" })).toMatch(/20 to 1,500/);
    expect(validateReplySettings({ ...ok, mode: "always" })).toMatch(/Choose/);
  });
});
