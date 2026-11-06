export function reviewSample(
  reviews: unknown,
  now = Date.now(),
): {
  newestReviewAt: string | null;
  newestReviewDays: number | null;
  returnedReviewDates: number;
  reviewsLast90Days: number;
} {
  const times = (Array.isArray(reviews) ? reviews : [])
    .map((review: any) => Date.parse(String(review?.publishTime ?? "")))
    .filter((time) => Number.isFinite(time) && time <= now)
    .sort((a, b) => b - a);
  const newest = times[0];
  return {
    newestReviewAt: newest === undefined ? null : new Date(newest).toISOString(),
    newestReviewDays: newest === undefined ? null : Math.floor((now - newest) / 86400000),
    returnedReviewDates: times.length,
    reviewsLast90Days: times.filter((time) => now - time <= 90 * 86400000).length,
  };
}

