// Shared reading comfort for the plain-HTML pages people outside RepSuites
// see (the report at /r/<token> and the review page behind every QR code).
//
// Follows the British Dyslexia Association style guide and WCAG 2.2 AA:
// big body text, open line spacing, short lines, no capitals or italics for
// long text, dark navy on off-white, a clear focus ring and big tap targets.
//
// "Easier reading" is a per-viewer switch, kept on their own phone in
// localStorage. It changes the font to Lexend and opens up the spacing.
// No em dashes in this copy (AGENTS.md).

// Rank colours shared by every rank map and grid. Blue, amber and red stay
// apart for colour-blind readers, and the number on each pin carries the
// meaning, so colour is never the only clue. Checked with the dataviz
// palette validator (deutan and tritan separation pass).
export const RANK_COLOURS = {
  top3: { bg: "#1f6fd1", fg: "#ffffff" },
  near: { bg: "#f0a020", fg: "#0b1b33" },
  far: { bg: "#d93a3f", fg: "#ffffff" },
  missing: { bg: "#ffffff", fg: "#0b1b33" },
  unknown: { bg: "#e2e8f0", fg: "#334155" },
} as const;

export type RankBand = keyof typeof RANK_COLOURS;

// Which band a rank falls in. -1 = not checked, null = not in the top 20.
export function rankBand(v: number | null): RankBand {
  if (v === -1) return "unknown";
  if (v === null) return "missing";
  if (v <= 3) return "top3";
  if (v <= 10) return "near";
  return "far";
}

// What a pin says: its number, or a dash when not in the top 20.
export function rankText(v: number | null): string {
  return v === -1 ? "?" : v === null ? "–" : String(v);
}

// Plain words for one pin, for screen readers and hover.
export function rankWords(v: number | null): string {
  return v === -1
    ? "not checked"
    : v === null
      ? "not in the top 20"
      : `number ${v}${v <= 3 ? " (top 3)" : ""}`;
}

// The CSS that makes a pin: shape and outline as well as colour, so the
// bands still differ in greyscale print and for colour-blind readers.
// Top 3: circle. 4 to 10: rounded square. 11 to 20: square.
// Not in the top 20: white circle with a dashed grey outline and a dash.
export const RANK_PIN_STYLE = `
.rk{display:flex;align-items:center;justify-content:center;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.rk-top3{background:#1f6fd1;color:#fff;border-radius:50%}
.rk-near{background:#f0a020;color:#0b1b33;border-radius:28%}
.rk-far{background:#d93a3f;color:#fff;border-radius:8%}
.rk-missing{background:#fff;color:#0b1b33;border-radius:50%;outline:2px dashed #64748b;outline-offset:-2px}
.rk-unknown{background:#e2e8f0;color:#334155;border-radius:50%}
.rkey-list{list-style:none;display:flex;flex-wrap:wrap;justify-content:center;gap:8px 18px;margin:12px 0 0;padding:0;font-size:1rem}
.rkey-list li{display:flex;align-items:center;gap:8px}
.rkey-list .rk{width:24px;height:24px;font-size:.75rem}
`;

// The legend, drawn with the same shapes as the pins.
export function rankLegend(): string {
  const item = (band: RankBand, sample: string, label: string) =>
    `<li><span class="rk rk-${band}" aria-hidden="true">${sample}</span>${label}</li>`;
  return `<ul class="rkey-list" aria-label="What the pins mean">${item("top3", "1", "Top 3")}${item("near", "5", "4 to 10")}${item("far", "14", "11 to 20")}${item("missing", "–", "Not in the top 20")}</ul>`;
}

const EASY_KEY = "rs-easy-reading";

// Runs in <head> before the page paints, so an "Easier reading" choice made
// earlier shows straight away with no flash.
export const READING_HEAD = `<script>(function(){try{if(localStorage.getItem("${EASY_KEY}")==="1"){document.documentElement.classList.add("easy");document.write('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;800&display=swap">');}}catch(e){}})();</script>`;

// Base reading styles. Pages add their own on top.
export const READING_STYLE = `
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{font-size:1.125rem;line-height:1.6;letter-spacing:.01em;word-spacing:.04em;text-align:left}
p,li{max-width:68ch}
:focus-visible{outline:3px solid #0b1b33;outline-offset:3px;box-shadow:0 0 0 6px #f5b324;border-radius:6px}
a{text-underline-offset:3px}
.easy body{font-family:Lexend,"Atkinson Hyperlegible",Verdana,system-ui,sans-serif;font-size:1.25rem;line-height:1.75;letter-spacing:.03em;word-spacing:.12em}
.easy p,.easy li{max-width:60ch}
.easy b,.easy strong{font-weight:800}
.rtoggle{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:8px 14px;border:2px solid #0b1b33;border-radius:999px;background:#fff;color:#0b1b33;font:inherit;font-size:1rem;font-weight:700;cursor:pointer}
.rtoggle[aria-pressed=true]{background:#0b1b33;color:#fff}
.rtoggle svg{flex-shrink:0}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
@media print{.rtoggle{display:none}}
`;

// The "Easier reading" switch. Put it once near the top of the page.
export function readingToggle(): string {
  return `<button type="button" class="rtoggle" id="rtoggle" aria-pressed="false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7V5h16v2M9 19h6M12 5v14"/></svg>Easier reading</button>
<script>(function(){var b=document.getElementById("rtoggle"),h=document.documentElement;function font(){if(document.getElementById("rfont"))return;var l=document.createElement("link");l.id="rfont";l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;800&display=swap";document.head.appendChild(l);}
function set(on){h.classList.toggle("easy",on);b.setAttribute("aria-pressed",on?"true":"false");if(on)font();try{localStorage.setItem("${EASY_KEY}",on?"1":"0");}catch(e){}}
b.setAttribute("aria-pressed",h.classList.contains("easy")?"true":"false");b.addEventListener("click",function(){set(!h.classList.contains("easy"));});})();</script>`;
}
