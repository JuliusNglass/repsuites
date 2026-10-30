// Is this business a place customers visit and sit down in (restaurant, cafe,
// bar, hotel), or one that goes to the customer (cleaner, trades, consultant)?
// Used to pick the printed review card and the words on the review page.
// Client-safe and pure. No em dashes in copy (AGENTS.md).

export type BusinessKind = "hospitality" | "service";

// Google categories (display names and gcid ids) and Places types.
const HOSPITALITY_WORDS =
  /\b(restaurants?|cafes?|cafés?|coffee|coffee_shop|bars?|pubs?|bistro|brasserie|grill|grill_house|kitchen|diner|eatery|takeaway|take away|meal_takeaway|meal_delivery|pizza|pizzeria|burgers?|bakery|bakeries|patisserie|hotels?|suites|lodge|lodging|inn|resort|motel|hostel|guest ?house|apartments?|lounge|tavern|wine|cocktail|tea ?room|deli|kebab|sushi|ramen|noodles?|curry|steak ?house|bnb|b&b|night_?club|food|catering|confectioner(y|ies)|ice cream)\b/i;

// Names that use a hospitality word but are trades ("kitchen fitters").
const TRADE_WORDS =
  /\b(fitters?|fitting|installers?|installations?|design|designs|plumbing|plumbers?|cleaning|cleaners?|repairs?|removals?|joinery|builders?|supplies|consult(ing|ancy|ants?)?|marketing|agency)\b/i;

export function businessKind(input: {
  category?: string | null;
  types?: readonly string[] | null;
  name?: string | null;
}): BusinessKind {
  const known = [input.category ?? "", ...(input.types ?? [])]
    .map((s) => s.replace(/^categories\//, "").replace(/^gcid:/, ""))
    .filter((s) => s.trim());
  // Google told us what the business is: trust that over the name.
  if (known.length)
    return known.some(
      (s) => HOSPITALITY_WORDS.test(s.replace(/_/g, " ")) || HOSPITALITY_WORDS.test(s),
    )
      ? "hospitality"
      : "service";
  const name = (input.name ?? "").trim();
  if (!name) return "service";
  if (TRADE_WORDS.test(name)) return "service";
  return HOSPITALITY_WORDS.test(name) ? "hospitality" : "service";
}

// The kind from a tenant row (name plus the settings saved from Google).
export function tenantKind(t: { name?: string | null; settings?: unknown }): BusinessKind {
  const s = (t.settings && typeof t.settings === "object" ? t.settings : {}) as Record<
    string,
    unknown
  >;
  const category = typeof s["google_category"] === "string" ? s["google_category"] : null;
  const types = Array.isArray(s["google_types"])
    ? (s["google_types"] as unknown[]).filter((x): x is string => typeof x === "string")
    : null;
  return businessKind({ category, types, name: t.name ?? null });
}
