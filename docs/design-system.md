# RepSuites design system

Tokens and components live in `src/styles.css`. Shared primitives
(`src/components/ui/button.tsx`, `card.tsx`, `input.tsx`) use the same tokens,
so the logged-in app picks up the look without page-by-page work.

## Type

- **Headings: Fraunces (variable, optical sizing), weight 600.** A modern
  serif with real character at large sizes. It is what moves the brand from
  "admin tool" to "premium service". Italic gold is used for one phrase per
  hero, never more.
- **Body: Atkinson Hyperlegible Next.** Designed by the Braille Institute for
  low-vision readers: clear letter shapes (no I/l/1 or O/0 confusion), open
  counters. Kept at 16px+ with 1.6 line height, left aligned, for
  dyslexia-friendly reading.
- Both are self-hosted via Fontsource (no Google request, GDPR friendly).
- Eyebrows (`.eyebrow`): 14px, bold, uppercase, 0.08em tracking, gold ink.

## Colour

- **Navy** `--navy` (oklch 0.21 0.06 258): dark sections, step numbers, text.
- **Gold** `--primary`: fills only (buttons, badges). Never as text on light.
- **Gold ink** `--primary-ink` (#9a6700 family, 4.6:1): gold text on light.
- **Gold soft** `--gold-soft`: icon tiles, highlights, text selection.
- **Ivory canvas** `--background` (warm off-white) instead of cold grey: it
  reads like print and makes gold look richer. Muted text is 6.9:1.
- On navy, body text is white at 85% or more; gold text is the bright gold.

## Shape, depth, spacing

- Radius base 0.75rem; cards 1.25rem (`.card`), feature panels 1.5 to 2rem,
  buttons fully rounded.
- Shadows are soft and layered: `--shadow-xs`, `--shadow-card`,
  `--shadow-lift` (hero objects), `--shadow-gold` (primary button glow).
- Spacing follows the Tailwind 4px scale; sections use 56 to 96px vertical
  rhythm, 16px page gutters on phones.

## Components

- `.btn` + `.btn-gold` (primary), `.btn-navy`, `.btn-ghost`; `.btn-lg` is
  56px tall. Every button is at least 44px tall.
- `.card`, `.field` (48px inputs), `.surface-navy` (navy panel with a soft
  gold and blue glow), `.faq` (details/summary with a rotating chevron).

## Accessibility rules

WCAG 2.2 AA contrast, visible 3px focus rings, 44px tap targets, mobile first
at 360px, and `prefers-reduced-motion` removes all transitions and animation.
No em dashes in copy. No invented testimonials or numbers: the Fix-It Pack
preview uses grey bars, not fake text.
