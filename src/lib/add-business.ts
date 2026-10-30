// Pure helpers for "Add a business" (Accelur8 team only). Client-safe.
// No em dashes in this copy (AGENTS.md).
import { PLAN_FEATURES } from "./shop";

export const ADD_PLANS = [
  { id: "free", label: "Free" },
  { id: "gold", label: "Growth" },
  { id: "managed", label: "We do it for you" },
] as const;
export type AddPlan = (typeof ADD_PLANS)[number]["id"];

export function isAddPlan(p: string): p is AddPlan {
  return ADD_PLANS.some((x) => x.id === p);
}

// The features a new business gets on this plan.
export function featuresFor(plan: AddPlan): string[] {
  return plan === "free" ? [] : [...PLAN_FEATURES[plan]];
}

export interface AddBusinessInput {
  name: string;
  ownerName?: string | undefined;
  ownerEmail?: string | undefined;
  plan: string;
}

// Plain-words problems with the form, or null if it is fine.
export function addBusinessProblem(i: AddBusinessInput): string | null {
  if (i.name.trim().length < 2) return "Add the business name.";
  if (i.name.trim().length > 120) return "The business name is too long.";
  const e = (i.ownerEmail ?? "").trim();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return "Check the owner's email address.";
  if (!isAddPlan(i.plan)) return "Pick a plan.";
  return null;
}

// The prospect's notes after the business becomes a client.
export function addedNote(notes: string | null, when: Date): string {
  const day = when.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
  return [notes, `Added as client ${day}`].filter(Boolean).join("\n").slice(0, 4000);
}
