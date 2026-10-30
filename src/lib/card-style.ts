// Which look a review card uses. Client-safe, no browser APIs.
//   "stand": the same background photo or colours as the QR stand
//   "brand": the business's brand colours
//   any THEMES id from the print designer (navy, cream, forest, ...)
import { THEMES } from "./print-design";

export interface SavedLook {
  background: string | null; // QR stand background photo
  standTheme: string | null; // QR stand colour theme id ("brand" or a THEMES id)
  primary: string | null;
  cardStyle: string | null;
}

export type CardLook =
  | { kind: "photo"; url: string; themeId: string }
  | { kind: "brand" }
  | { kind: "theme"; themeId: string };

export function hasStandLook(s: SavedLook): boolean {
  return !!s.background || !!s.standTheme;
}

// The style to show as chosen: the saved one, else the QR stand look when
// there is one, else brand colours when set, else navy.
export function chosenStyle(s: SavedLook): string {
  const ok = (id: string | null) =>
    !!id &&
    (id === "brand" || THEMES.some((t) => t.id === id) || (id === "stand" && hasStandLook(s)));
  if (ok(s.cardStyle)) return s.cardStyle!;
  if (hasStandLook(s)) return "stand";
  return s.primary ? "brand" : "navy";
}

// What to draw for a chosen style.
export function cardLook(s: SavedLook): CardLook {
  const style = chosenStyle(s);
  if (style === "stand") {
    const t = s.standTheme && s.standTheme !== "brand" ? s.standTheme : null;
    if (s.background) return { kind: "photo", url: s.background, themeId: t ?? "brand" };
    if (s.standTheme === "brand" || !t)
      return s.primary ? { kind: "brand" } : { kind: "theme", themeId: "navy" };
    return { kind: "theme", themeId: t };
  }
  if (style === "brand") return s.primary ? { kind: "brand" } : { kind: "theme", themeId: "navy" };
  return { kind: "theme", themeId: style };
}

export const CARD_STYLES = (s: SavedLook) => [
  ...(hasStandLook(s) ? [{ id: "stand", name: "Same as my QR stand" }] : []),
  { id: "brand", name: "My brand colours" },
  ...THEMES.map((t) => ({ id: t.id, name: t.name })),
];

// After the background photo changes: the card style to save, or undefined
// to leave it alone. A new photo switches "brand" (or nothing chosen yet) to
// the QR stand look; removing the photo stops pointing at a stand look that
// no longer exists.
export function styleAfterBackground(
  current: string | null,
  hasBackground: boolean,
  standTheme: string | null,
): string | undefined {
  if (hasBackground) return !current || current === "brand" ? "stand" : undefined;
  if (current === "stand" && !standTheme) return "brand";
  return undefined;
}
