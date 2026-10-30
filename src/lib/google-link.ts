// Pure helpers for linking a business's QR codes and review links to its
// Google profile once the profile is connected. Client-safe.
import { reviewUrl } from "./signup";

export interface LinkPlan {
  // QR codes to point at Google (only codes with no target yet).
  codeIds: string[];
  placeId: string | null;
  target: string | null;
  // Add a Google review link (the business has none yet).
  addReviewLink: boolean;
}

export function googleLinkPlan(input: {
  placeId: string | null;
  codes: { id: string; target_url: string | null }[];
  hasGoogleReviewLink: boolean;
}): LinkPlan {
  const placeId =
    input.placeId && /^[A-Za-z0-9_-]{10,300}$/.test(input.placeId) ? input.placeId : null;
  if (!placeId) return { codeIds: [], placeId: null, target: null, addReviewLink: false };
  return {
    codeIds: input.codes.filter((c) => !c.target_url).map((c) => c.id),
    placeId,
    target: reviewUrl(placeId),
    addReviewLink: !input.hasGoogleReviewLink,
  };
}

// The primary category from a Business Profile location: its name (for
// example "Marketing consultant") and id ("gcid:marketing_consultant").
export function primaryCategory(location: unknown): { name: string; id: string } | null {
  const c = (location as { categories?: { primaryCategory?: Record<string, unknown> } } | null)
    ?.categories?.primaryCategory;
  if (!c) return null;
  const name = typeof c["displayName"] === "string" ? c["displayName"].slice(0, 120) : "";
  const id =
    typeof c["name"] === "string" ? c["name"].replace(/^categories\//, "").slice(0, 120) : "";
  return name || id ? { name, id } : null;
}
