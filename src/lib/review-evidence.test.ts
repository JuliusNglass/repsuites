import { describe, expect, it } from "vitest";
import { reviewSample } from "./review-evidence";

describe("reviewSample", () => {
  it("reports the newest returned review and a clearly bounded 90-day sample", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    expect(
      reviewSample(
        [
          { publishTime: "2026-11-01T12:00:00Z" },
          { publishTime: "2026-09-01T12:00:00Z" },
          { publishTime: "2026-01-01T12:00:00Z" },
        ],
        now,
      ),
    ).toEqual({
      newestReviewAt: "2026-11-01T12:00:00.000Z",
      newestReviewDays: 5,
      returnedReviewDates: 3,
      reviewsLast90Days: 2,
    });
  });
});

