// Brand colours as hex codes. Client-safe and shared by the print designer
// and the feedback page.
import type { Theme } from "./print-design";

// Accepts "#1A2b3c", "1a2b3c" or "#abc"; returns "#rrggbb" or null.
export function normaliseHex(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (s.startsWith("#")) s = s.slice(1);
  if (/^[0-9a-f]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// How bright a colour looks to the eye, 0 (black) to 1 (white).
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// White or near-black, whichever reads better on the colour.
export function textOn(hex: string): string {
  return luminance(hex) > 0.45 ? "#0f172a" : "#ffffff";
}

// Lighten (positive) or darken (negative) by a fraction, e.g. -0.15.
export function shade(hex: string, amount: number): string {
  const out = rgb(hex).map((v) =>
    Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount),
  );
  return `#${out.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

// The print designer theme made from a business's own colours: the primary
// colour as the background (with a gentle gradient), the secondary as the
// highlight for the business name.
export function brandTheme(primary: string, secondary: string | null): Theme {
  const text = textOn(primary);
  let accent = secondary ?? (text === "#ffffff" ? "#ffffff" : "#0f172a");
  // If the secondary colour would vanish against the background, use the text colour.
  if (Math.abs(luminance(accent) - luminance(primary)) < 0.08) accent = text;
  return {
    id: "brand",
    name: "Your brand colours",
    bg: [primary, shade(primary, luminance(primary) > 0.45 ? -0.08 : -0.22)],
    text,
    accent,
  };
}
