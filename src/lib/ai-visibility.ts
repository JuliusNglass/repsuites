// AI search visibility: pure helpers. Client-safe. No em dashes in copy.

export interface AiAnswer {
  question: string;
  named: boolean;
  position: number | null; // 1 = first business the assistant named
  businesses: string[]; // the businesses it named, in order
}

// The questions a customer would ask an assistant.
export function aiQuestions(service: string, town: string): string[] {
  const s = service.trim().toLowerCase();
  const t = town.trim();
  return [
    `What is the best ${s} in ${t}?`,
    `Can you recommend a good ${s} near ${t}?`,
    `Which ${s} in ${t} has the best reviews?`,
  ];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|ltd|limited|llc|inc|plc|co)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// True when a listed name is the business: exact after tidying, or one
// contains the other ("The Italian Job" vs "Italian Job Newport").
export function sameBusiness(listed: string, business: string): boolean {
  const a = norm(listed);
  const b = norm(business);
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  return short.length >= 5 && long.includes(short);
}

// Reads the assistant's list (JSON {"businesses": [...]}) and finds the business.
export function readAnswer(question: string, text: string, business: string): AiAnswer {
  let list: string[] = [];
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]) as { businesses?: unknown };
      if (Array.isArray(o.businesses))
        list = o.businesses
          .map((b) => (typeof b === "string" ? b : String((b as { name?: unknown })?.name ?? "")))
          .map((b) => b.trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, 10);
    } catch {
      list = [];
    }
  }
  const idx = list.findIndex((b) => sameBusiness(b, business));
  return {
    question,
    named: idx >= 0,
    position: idx >= 0 ? idx + 1 : null,
    businesses: list,
  };
}
