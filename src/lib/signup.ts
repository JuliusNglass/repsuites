// Pure helpers for the free sign-up. Client-safe. No em dashes in copy.

export const PLACE_RE = /^[A-Za-z0-9_-]{10,300}$/;
export const REPORT_RE = /^[A-Za-z0-9_-]{20,64}$/;

// The Google "write a review" link for a business, from its place ID.
export function reviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

export interface SignupInput {
  business: string;
  name: string;
  email: string;
  password: string;
  agree: boolean;
}

export type SignupField = "business" | "name" | "email" | "password" | "agree";

// The first problem with the form and the field it belongs to, so the page
// can show the message right next to that field. Null if it is fine.
export function signupProblemAt(i: SignupInput): { field: SignupField; message: string } | null {
  if (i.business.trim().length < 2)
    return { field: "business", message: "Add your business name." };
  if (i.name.trim().length < 2) return { field: "name", message: "Add your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(i.email.trim()))
    return { field: "email", message: "Check your email address." };
  if (i.password.length < 10)
    return { field: "password", message: "Your password needs at least 10 characters." };
  if (!i.agree) return { field: "agree", message: "Tick the box to agree to the terms." };
  return null;
}

// Plain-words problems with the form, or null if it is fine.
export function signupProblem(i: SignupInput): string | null {
  return signupProblemAt(i)?.message ?? null;
}

// A prospect who signs up from their report is won.
export function stageAfterSignup(stage: string): string {
  void stage;
  return "won";
}

// The name to put in "Your name" when someone arrives from their report: the
// contact name we saved, else the owner's first name. Worked example: no
// contact name and director "SMITH, John" gives "John".
export function prefillName(contactName: string | null | undefined, ownerFirst: string): string {
  const c = (contactName ?? "").replace(/\s+/g, " ").trim();
  if (c.length >= 2 && c.length <= 120) return c;
  const o = ownerFirst.trim();
  return o.length >= 2 ? o : "";
}
