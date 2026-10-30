// Printable review cards and a picture for online use, drawn on a canvas.
// Print formats are drawn at 300 dpi with a 3 mm bleed and saved as a
// print-ready PDF (exact size) or PNG. The online banner is a PNG only.
// Client-only for drawing (uses the browser canvas); the tables and size
// helpers at the top are pure.
// No em dashes in this copy (AGENTS.md).

export type PrintFormat = "a5" | "square" | "coaster" | "card" | "a6" | "sticker" | "email";

// "venue": a shop, cafe or restaurant. "job": work done at a customer's home
// or office. "online": email signatures, invoices and WhatsApp.
export type FormatGroup = "venue" | "job" | "online";

export interface FormatInfo {
  label: string;
  bestFor: string;
  group: FormatGroup;
  wMm: number; // finished size (print formats)
  hMm: number;
  round: boolean;
  // Online pictures: exact pixel size, no bleed, PNG only.
  px?: { w: number; h: number };
  // Small formats: headline only, no second line.
  small?: boolean;
}

export const FORMATS: Record<PrintFormat, FormatInfo> = {
  a5: {
    label: "Table stand (A5)",
    bestFor: "Tables, counters and reception desks",
    group: "venue",
    wMm: 148,
    hMm: 210,
    round: false,
  },
  square: {
    label: "Square card (95 mm)",
    bestFor: "Counters, bags and with the bill",
    group: "venue",
    wMm: 95,
    hMm: 95,
    round: false,
  },
  coaster: {
    label: "Coaster (95 mm round)",
    bestFor: "Drinks on tables and at the bar",
    group: "venue",
    wMm: 95,
    hMm: 95,
    round: true,
  },
  card: {
    label: "Business card (85 x 55 mm)",
    bestFor: "Hand over at the end of a job",
    group: "job",
    wMm: 85,
    hMm: 55,
    round: false,
    small: true,
  },
  a6: {
    label: "Thank-you card (A6)",
    bestFor: "Leave at the home or post with an invoice",
    group: "job",
    wMm: 105,
    hMm: 148,
    round: false,
  },
  sticker: {
    label: "Round sticker (50 mm)",
    bestFor: "Vans, toolboxes, invoices and folders",
    group: "job",
    wMm: 50,
    hMm: 50,
    round: true,
    small: true,
  },
  email: {
    label: "Email and WhatsApp picture",
    bestFor: "Email signatures, invoices and WhatsApp",
    group: "online",
    wMm: 0,
    hMm: 0,
    round: false,
    px: { w: 600, h: 200 },
  },
};

export const FORMAT_GROUPS: { id: FormatGroup; title: string }[] = [
  { id: "venue", title: "For a shop, cafe or restaurant" },
  { id: "job", title: "For jobs at customers' homes or offices" },
  { id: "online", title: "For online" },
];

export const BLEED_MM = 3;
const DPI = 300;
const PX_PER_MM = DPI / 25.4;

// Canvas size in pixels for a format (print formats include the bleed).
export function canvasSize(format: PrintFormat, scale = 1): { w: number; h: number } {
  const f = FORMATS[format];
  if (f.px) return { w: Math.round(f.px.w * scale), h: Math.round(f.px.h * scale) };
  return { w: px(f.wMm + BLEED_MM * 2) * scale, h: px(f.hMm + BLEED_MM * 2) * scale };
}

// The size to ask a printer for, in plain words.
export function sizeText(format: PrintFormat): string {
  const f = FORMATS[format];
  if (f.px) return `${f.px.w} x ${f.px.h} pixels`;
  if (f.round) return `${f.wMm} mm round (cut to a circle)`;
  return `${f.wMm} x ${f.hMm} mm`;
}

export function isDigital(format: PrintFormat): boolean {
  return !!FORMATS[format].px;
}

// The format to start with: a table stand for hospitality, otherwise a
// business card for handing over after a job.
export function defaultFormat(hospitality: boolean): PrintFormat {
  return hospitality ? "a5" : "card";
}

// Short, warm and within Google's rules: every customer is invited (good,
// bad or brilliant), nothing is offered in return for a review.
// "fits" says which kind of business the words suit best.
export interface Message {
  headline: string;
  sub: string;
  fits: "visit" | "job" | "any";
}

export const MESSAGES: Message[] = [
  {
    headline: "How did we do today?",
    sub: "Good, bad or brilliant, we want to hear it. Scan to leave a quick review.",
    fits: "visit",
  },
  {
    headline: "Thank you for your business",
    sub: "Your review helps other people find us. It takes 30 seconds. Scan here.",
    fits: "any",
  },
  {
    headline: "Every review helps a local business",
    sub: "Point your camera at the code and tell us about your visit. We read every one.",
    fits: "visit",
  },
  {
    headline: "Got 30 seconds?",
    sub: "Scan, tap the stars, say a few words. It makes a real difference to us.",
    fits: "any",
  },
  {
    headline: "Your opinion shapes what we do",
    sub: "Share your experience in a quick review. Scan with your phone camera.",
    fits: "visit",
  },
  {
    headline: "How did we do on your job?",
    sub: "Good, bad or brilliant, we want to hear it. Scan to leave a quick review.",
    fits: "job",
  },
  {
    headline: "Thanks for choosing us",
    sub: "Your review helps other people find a business they can trust. It takes 30 seconds.",
    fits: "job",
  },
  {
    headline: "Happy with the work? Tell others",
    sub: "Scan the code and leave a quick review. Good or bad, we read every one.",
    fits: "job",
  },
  {
    headline: "Thank you for having us",
    sub: "Tell others how the job went in a quick review. Scan with your phone camera.",
    fits: "job",
  },
];

// Messages in the order to offer them: the ones that suit this kind of
// business first. Returns indexes into MESSAGES.
export function messageOrder(hospitality: boolean): number[] {
  const want = hospitality ? "visit" : "job";
  const idx = MESSAGES.map((_, i) => i);
  const rank = (i: number) =>
    MESSAGES[i]!.fits === want ? 0 : MESSAGES[i]!.fits === "any" ? 1 : 2;
  return idx.sort((a, b) => rank(a) - rank(b) || a - b);
}

// Index of the message to start with.
export function defaultMessage(hospitality: boolean): number {
  return messageOrder(hospitality)[0]!;
}

export interface Theme {
  id: string;
  name: string;
  bg: [string, string]; // gradient from, to
  text: string;
  accent: string;
}

export const THEMES: Theme[] = [
  {
    id: "navy",
    name: "Navy and gold",
    bg: ["#0b1d3a", "#132f5c"],
    text: "#ffffff",
    accent: "#f5b324",
  },
  {
    id: "cream",
    name: "Warm cream",
    bg: ["#fbf6ec", "#f3e7cf"],
    text: "#2a1d0e",
    accent: "#b45309",
  },
  { id: "forest", name: "Forest", bg: ["#0f3b2e", "#1d5c47"], text: "#ffffff", accent: "#facc15" },
  {
    id: "white",
    name: "Clean white",
    bg: ["#ffffff", "#f1f5f9"],
    text: "#0f172a",
    accent: "#2563eb",
  },
  { id: "coral", name: "Coral", bg: ["#ff6b5a", "#e8455f"], text: "#ffffff", accent: "#fff3c4" },
  {
    id: "charcoal",
    name: "Charcoal",
    bg: ["#1f2937", "#111827"],
    text: "#ffffff",
    accent: "#34d399",
  },
];

export interface Design {
  format: PrintFormat;
  business: string;
  headline: string;
  sub: string;
  theme: Theme;
  logo: HTMLImageElement | null;
  photo: HTMLImageElement | null; // background photo (optional)
  qr: HTMLCanvasElement; // a large QR code canvas
  footer: boolean; // small "Scan with your phone camera" line
  poweredQr?: HTMLCanvasElement; // small code to repsuites.com ("Powered by RepSuites")
}

function px(mm: number): number {
  return Math.round(mm * PX_PER_MM);
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

// Wrap text to a width; returns the lines.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// Biggest font size (px) at which the text fits in maxLines lines.
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
  start: number,
  weight: number,
): { size: number; lines: string[] } {
  for (let size = start; size > 10; size -= 2) {
    ctx.font = `${weight} ${size}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW))
      return { size, lines };
  }
  ctx.font = `${weight} 10px system-ui, sans-serif`;
  return { size: 10, lines: wrap(ctx, text, maxW) };
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  cx: number,
  top: number,
  lineH: number,
): number {
  lines.forEach((l, i) => ctx.fillText(l, cx, top + i * lineH));
  return top + lines.length * lineH;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Text along an arc of the circle, letters upright and reading left to
// right: "top" runs over the top edge, "bottom" along the bottom edge.
// The font shrinks (down to minSize) until the text fits in maxAngle.
function arcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  side: "top" | "bottom",
  size: number,
  minSize: number,
  weight: number,
  maxAngle: number,
) {
  let t = text.trim();
  if (!t) return;
  let fs = size;
  let widths: number[] = [];
  let total = 0;
  const measure = () => {
    ctx.font = `${weight} ${fs}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
    const track = fs * 0.04;
    widths = [...t].map((ch) => ctx.measureText(ch).width + track);
    total = widths.reduce((a, b) => a + b, 0) / radius;
  };
  for (; fs >= minSize; fs -= 0.5) {
    measure();
    if (total <= maxAngle) break;
  }
  // Still too long at the smallest size: shorten it rather than overlap.
  if (total > maxAngle) {
    fs = minSize;
    const chars = [...t];
    while (total > maxAngle && chars.length > 4) {
      chars.pop();
      t = `${chars.join("").trimEnd()}...`;
      measure();
    }
  }
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const chars = [...t];
  if (side === "top") {
    let a = -Math.PI / 2 - total / 2;
    chars.forEach((ch, i) => {
      const half = widths[i]! / 2 / radius;
      a += half;
      ctx.save();
      ctx.translate(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      a += half;
    });
  } else {
    let a = Math.PI / 2 + total / 2;
    chars.forEach((ch, i) => {
      const half = widths[i]! / 2 / radius;
      a -= half;
      ctx.save();
      ctx.translate(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      ctx.rotate(a - Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      a -= half;
    });
  }
  ctx.restore();
}

const FONT = `"Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;

// The QR code on a white rounded card, crisp edges.
function qrCard(
  ctx: CanvasRenderingContext2D,
  qr: HTMLCanvasElement,
  x: number,
  y: number,
  size: number,
  pad: number,
  radius: number,
) {
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, size, size, radius);
  ctx.fill();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, x + pad, y + pad, size - pad * 2, size - pad * 2);
  ctx.imageSmoothingEnabled = true;
}

// A small "Powered by RepSuites" code with its label to the right.
// x is the left edge, y the top of the code. Returns the total width.
function poweredRow(
  ctx: CanvasRenderingContext2D,
  powered: HTMLCanvasElement,
  x: number,
  y: number,
  q: number,
  labelPx: number,
  colour: string,
  mm: number,
): number {
  qrCard(ctx, powered, x, y, q, q * 0.1, q * 0.13);
  const gap = Math.max(1.5 * mm, q * 0.22);
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.85;
  ctx.font = `700 ${labelPx}px system-ui, sans-serif`;
  ctx.fillText("Powered by RepSuites", x + q + gap, y + q / 2);
  const w = q + gap + ctx.measureText("Powered by RepSuites").width;
  ctx.restore();
  return w;
}

// Business card, 85 x 55 mm landscape: name or logo and a short headline on
// the left, a big QR code on the right, "Powered by RepSuites" at the foot.
function drawCard(
  ctx: CanvasRenderingContext2D,
  d: Design,
  W: number,
  H: number,
  mm: number,
  text: string,
  accent: string,
) {
  const inner = (BLEED_MM + 4) * mm;
  const card = 34 * mm; // QR inside is 29 mm wide
  const cardX = W - inner - card;
  qrCard(ctx, d.qr, cardX, (H - card) / 2, card, 2.5 * mm, 2.5 * mm);

  const x0 = inner;
  const colW = cardX - 4 * mm - x0;
  const q = 9 * mm;
  const bottom = d.poweredQr ? H - inner - q - 2 * mm : H - inner;

  // Measure first so the words sit in the middle of the space.
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const logoH = 8 * mm;
  const name = d.logo ? null : fit(ctx, d.business.toUpperCase(), colW, 2, 3.6 * mm, 800);
  const head = fit(ctx, d.headline, colW, 3, 5.6 * mm, 800);
  const nameH = d.logo ? logoH + 2.5 * mm : name!.lines.length * name!.size * 1.15 + 2 * mm;
  const headH = head.lines.length * head.size * 1.1;
  const footH = d.footer ? 4.2 * mm : 0;
  let y = inner + Math.max(0, (bottom - inner - (nameH + headH + footH)) / 2);

  if (d.logo) {
    const lw = Math.min(colW, (d.logo.width / d.logo.height) * logoH);
    ctx.drawImage(d.logo, x0, y, lw, logoH);
    y += logoH + 2.5 * mm;
  } else {
    ctx.fillStyle = accent;
    ctx.font = `800 ${name!.size}px ${FONT}`;
    y = drawLines(ctx, name!.lines, x0, y, name!.size * 1.15) + 2 * mm;
  }
  ctx.fillStyle = text;
  ctx.font = `800 ${head.size}px ${FONT}`;
  y = drawLines(ctx, head.lines, x0, y, head.size * 1.1);
  if (d.footer) {
    ctx.globalAlpha = 0.8;
    ctx.font = `600 ${2.6 * mm}px system-ui, sans-serif`;
    ctx.fillText("Scan to leave a review", x0, y + 1.6 * mm);
    ctx.globalAlpha = 1;
  }
  if (d.poweredQr) poweredRow(ctx, d.poweredQr, x0, H - inner - q, q, 2.3 * mm, text, mm);
  ctx.textAlign = "center";
}

// Thank-you card, A6 portrait: logo, name, headline, message, a large QR
// code and "Powered by RepSuites" at the foot.
function drawA6(
  ctx: CanvasRenderingContext2D,
  d: Design,
  W: number,
  H: number,
  mm: number,
  text: string,
  accent: string,
) {
  const inner = (BLEED_MM + 5) * mm;
  const maxW = W - inner * 2;
  const cx = W / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let y = inner + 2 * mm;
  if (d.logo) {
    const lh = 12 * mm;
    const lw = Math.min(maxW, (d.logo.width / d.logo.height) * lh);
    ctx.drawImage(d.logo, cx - lw / 2, y, lw, lh);
    y += lh + 3 * mm;
  }
  ctx.fillStyle = accent;
  const name = fit(ctx, d.business.toUpperCase(), maxW, d.logo ? 1 : 2, 5 * mm, 800);
  y = drawLines(ctx, name.lines, cx, y, name.size * 1.15) + 3 * mm;

  ctx.fillStyle = text;
  const head = fit(ctx, d.headline, maxW, 2, 10 * mm, 800);
  y = drawLines(ctx, head.lines, cx, y, head.size * 1.12) + 3 * mm;

  if (d.sub) {
    ctx.globalAlpha = 0.9;
    const sub = fit(ctx, d.sub, maxW * 0.92, 3, 4.2 * mm, 500);
    y = drawLines(ctx, sub.lines, cx, y, sub.size * 1.35) + 4 * mm;
    ctx.globalAlpha = 1;
  }

  const q = 11 * mm;
  const powerH = d.poweredQr ? q + 3 * mm : 0;
  const footH = d.footer ? 7 * mm : 2 * mm;
  const room = H - inner - powerH - footH - y;
  const card = Math.max(0, Math.min(62 * mm, room, maxW));
  qrCard(ctx, d.qr, cx - card / 2, y, card, 4 * mm, 3.5 * mm);
  y += card + 2.5 * mm;
  if (d.footer) {
    ctx.fillStyle = text;
    ctx.globalAlpha = 0.8;
    ctx.font = `600 ${3.2 * mm}px system-ui, sans-serif`;
    ctx.fillText("Point your phone camera at the code", cx, y);
    ctx.globalAlpha = 1;
  }
  if (d.poweredQr) {
    ctx.font = `700 ${2.8 * mm}px system-ui, sans-serif`;
    const w = q + Math.max(1.5 * mm, q * 0.22) + ctx.measureText("Powered by RepSuites").width;
    poweredRow(ctx, d.poweredQr, cx - w / 2, H - inner - q, q, 2.8 * mm, text, mm);
  }
}

// Round sticker, 50 mm: the headline round the top, the business name round
// the bottom and a QR code (20 mm or more) in the middle. Too small for a
// second code, so "Powered by RepSuites" is a tiny line of text.
function drawSticker(
  ctx: CanvasRenderingContext2D,
  d: Design,
  W: number,
  H: number,
  mm: number,
  text: string,
  accent: string,
) {
  const r = (FORMATS.sticker.wMm / 2) * mm;
  const cx = W / 2;
  const cy = H / 2;
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.35 * mm;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1.8 * mm, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const card = 24 * mm;
  const pad = 1.8 * mm; // QR inside is 20.4 mm wide
  const top = cy - card / 2 - 0.5 * mm;
  qrCard(ctx, d.qr, cx - card / 2, top, card, pad, 2 * mm);

  ctx.fillStyle = text;
  arcText(
    ctx,
    d.headline,
    cx,
    cy,
    r - 5.2 * mm,
    "top",
    3.4 * mm,
    2.2 * mm,
    800,
    (190 * Math.PI) / 180,
  );
  ctx.fillStyle = accent;
  arcText(
    ctx,
    d.business.toUpperCase(),
    cx,
    cy,
    r - 4.6 * mm,
    "bottom",
    2.8 * mm,
    1.9 * mm,
    800,
    (120 * Math.PI) / 180,
  );
  if (d.poweredQr) {
    ctx.save();
    ctx.fillStyle = text;
    ctx.globalAlpha = 0.75;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `700 ${1.7 * mm}px system-ui, sans-serif`;
    ctx.fillText("Powered by RepSuites", cx, top + card + 1.1 * mm);
    ctx.restore();
  }
}

// Online picture, 600 x 200 px: logo or name and the headline on the left,
// the QR code on the right. For email signatures, invoices and WhatsApp.
function drawBanner(
  ctx: CanvasRenderingContext2D,
  d: Design,
  W: number,
  H: number,
  s: number,
  text: string,
  accent: string,
) {
  const card = 176 * s;
  const cardX = W - 12 * s - card;
  qrCard(ctx, d.qr, cardX, (H - card) / 2, card, 10 * s, 12 * s);
  const x0 = 26 * s;
  const colW = cardX - 22 * s - x0;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const logoH = 40 * s;
  const name = d.logo ? null : fit(ctx, d.business.toUpperCase(), colW, 1, 22 * s, 800);
  const head = fit(ctx, d.headline, colW, 2, 34 * s, 800);
  const nameH = d.logo ? logoH + 10 * s : name!.size * 1.15 + 8 * s;
  const headH = head.lines.length * head.size * 1.1;
  const footH = d.footer ? 24 * s : 0;
  const bottom = H - 30 * s;
  let y = 16 * s + Math.max(0, (bottom - 16 * s - (nameH + headH + footH)) / 2);
  if (d.logo) {
    const lw = Math.min(colW, (d.logo.width / d.logo.height) * logoH);
    ctx.drawImage(d.logo, x0, y, lw, logoH);
    y += logoH + 10 * s;
  } else {
    ctx.fillStyle = accent;
    ctx.font = `800 ${name!.size}px ${FONT}`;
    y = drawLines(ctx, name!.lines, x0, y, name!.size * 1.15) + 8 * s;
  }
  ctx.fillStyle = text;
  ctx.font = `800 ${head.size}px ${FONT}`;
  y = drawLines(ctx, head.lines, x0, y, head.size * 1.1);
  if (d.footer) {
    ctx.globalAlpha = 0.85;
    ctx.font = `600 ${16 * s}px system-ui, sans-serif`;
    ctx.fillText("Scan the code to leave a quick review", x0, y + 8 * s, colW);
    ctx.globalAlpha = 1;
  }
  if (d.poweredQr) {
    ctx.globalAlpha = 0.6;
    ctx.font = `600 ${11 * s}px system-ui, sans-serif`;
    ctx.fillText("Powered by RepSuites", x0, H - 22 * s);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "center";
}

// Draw the full artwork (including bleed) and return the canvas.
// showGuides adds the cut line and safe area for the on-screen preview only.
export function renderDesign(d: Design, showGuides = false, scale = 1): HTMLCanvasElement {
  const f = FORMATS[d.format];
  const { w: W, h: H } = canvasSize(d.format, scale);
  const mm = PX_PER_MM * scale;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Background: photo with a darkening layer, or the theme gradient.
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, d.theme.bg[0]);
  g.addColorStop(1, d.theme.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  let text = d.theme.text;
  let accent = d.theme.accent;
  if (d.photo) {
    cover(ctx, d.photo, W, H);
    ctx.fillStyle = "rgba(8, 12, 24, 0.58)";
    ctx.fillRect(0, 0, W, H);
    text = "#ffffff";
    accent = d.theme.id === "white" || d.theme.id === "cream" ? "#f5b324" : d.theme.accent;
  }

  if (f.px) {
    drawBanner(ctx, d, W, H, scale, text, accent);
    return c;
  }

  const cx = W / 2;
  const safe = 6 * mm; // keep words this far inside the cut line
  const inner = BLEED_MM * mm + safe;

  if (d.format === "a5") {
    const maxW = W - inner * 2;
    let y = inner + 4 * mm;
    if (d.logo) {
      const lh = 22 * mm;
      const lw = Math.min(maxW, (d.logo.width / d.logo.height) * lh);
      ctx.drawImage(d.logo, cx - lw / 2, y, lw, lh);
      y += lh + 5 * mm;
    }
    ctx.fillStyle = accent;
    const name = fit(ctx, d.business.toUpperCase(), maxW, 2, 7 * mm, 800);
    y = drawLines(ctx, name.lines, cx, y, name.size * 1.15) + 5 * mm;

    ctx.fillStyle = text;
    const head = fit(ctx, d.headline, maxW, 3, 15 * mm, 800);
    y = drawLines(ctx, head.lines, cx, y, head.size * 1.12) + 4 * mm;

    ctx.globalAlpha = 0.9;
    const sub = fit(ctx, d.sub, maxW * 0.92, 3, 6 * mm, 500);
    y = drawLines(ctx, sub.lines, cx, y, sub.size * 1.35) + 7 * mm;
    ctx.globalAlpha = 1;

    // QR on a white card, as large as the space allows.
    const poweredH = d.poweredQr ? 17 * mm : 0;
    const footerH = (d.footer ? 12 * mm : 4 * mm) + poweredH;
    const room = H - inner - footerH - y;
    const card = Math.min(78 * mm, room, maxW);
    const pad = 5 * mm;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, cx - card / 2, y, card, card, 5 * mm);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(d.qr, cx - card / 2 + pad, y + pad, card - pad * 2, card - pad * 2);
    ctx.imageSmoothingEnabled = true;
    y += card + 5 * mm;
    if (d.footer) {
      ctx.fillStyle = text;
      ctx.globalAlpha = 0.8;
      ctx.font = `600 ${4.2 * mm}px system-ui, sans-serif`;
      ctx.fillText("Point your phone camera at the code", cx, y);
      ctx.globalAlpha = 1;
    }
    // "Powered by RepSuites" with a small code to repsuites.com, at the foot.
    if (d.poweredQr) {
      const q = 13 * mm;
      const qp = 1.2 * mm;
      const label = "Powered by RepSuites";
      const small = "Get more reviews: repsuites.com";
      ctx.font = `700 ${3.4 * mm}px system-ui, sans-serif`;
      const w1 = ctx.measureText(label).width;
      ctx.font = `500 ${2.8 * mm}px system-ui, sans-serif`;
      const w2 = ctx.measureText(small).width;
      const textW = Math.max(w1, w2);
      const gap = 3 * mm;
      const total = q + gap + textW;
      const x0 = cx - total / 2;
      const yq = H - inner - q;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, x0, yq, q, q, 1.5 * mm);
      ctx.fill();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(d.poweredQr, x0 + qp, yq + qp, q - qp * 2, q - qp * 2);
      ctx.imageSmoothingEnabled = true;
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = text;
      ctx.globalAlpha = 0.9;
      ctx.font = `700 ${3.4 * mm}px system-ui, sans-serif`;
      ctx.fillText(label, x0 + q + gap, yq + q / 2 - 2.2 * mm);
      ctx.globalAlpha = 0.75;
      ctx.font = `500 ${2.8 * mm}px system-ui, sans-serif`;
      ctx.fillText(small, x0 + q + gap, yq + q / 2 + 2.4 * mm);
      ctx.restore();
    }
  } else if (d.format === "square") {
    // Square card: logo or name, headline, QR code, message, and a tiny
    // "Powered by RepSuites" code at the foot.
    const maxW = W - inner * 2;
    let y = inner;
    if (d.logo) {
      const lh = 9 * mm;
      const lw = Math.min(maxW * 0.6, (d.logo.width / d.logo.height) * lh);
      ctx.drawImage(d.logo, cx - lw / 2, y, lw, lh);
      y += lh + 2.5 * mm;
    } else {
      ctx.fillStyle = accent;
      const name = fit(ctx, d.business.toUpperCase(), maxW, 1, 4.6 * mm, 800);
      y = drawLines(ctx, name.lines, cx, y, name.size * 1.15) + 2 * mm;
    }
    ctx.fillStyle = text;
    const head = fit(ctx, d.headline, maxW, 2, 6.6 * mm, 800);
    y = drawLines(ctx, head.lines, cx, y, head.size * 1.1) + 2.5 * mm;

    const powerH = d.poweredQr ? 9 * mm + 2 * mm : 0;
    ctx.globalAlpha = 0.9;
    ctx.font = `500 ${3.1 * mm}px system-ui, sans-serif`;
    const subLines = wrap(ctx, d.sub, maxW).slice(0, 2);
    ctx.globalAlpha = 1;
    const subH = subLines.length * 3.1 * mm * 1.3;
    const room = H - inner - powerH - subH - 2.5 * mm - y;
    const card = Math.min(40 * mm, room);
    const pad = 2.5 * mm;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, cx - card / 2, y, card, card, 3 * mm);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(d.qr, cx - card / 2 + pad, y + pad, card - pad * 2, card - pad * 2);
    ctx.imageSmoothingEnabled = true;
    y += card + 2.5 * mm;
    ctx.fillStyle = text;
    ctx.globalAlpha = 0.9;
    ctx.font = `500 ${3.1 * mm}px system-ui, sans-serif`;
    drawLines(ctx, subLines, cx, y, 3.1 * mm * 1.3);
    ctx.globalAlpha = 1;
    if (d.poweredQr) {
      const q = 9 * mm;
      const qp = 0.9 * mm;
      const label = "Powered by RepSuites";
      ctx.font = `700 ${2.5 * mm}px system-ui, sans-serif`;
      const tw = ctx.measureText(label).width;
      const gap = 2 * mm;
      const x0 = cx - (q + gap + tw) / 2;
      const yq = H - inner - q;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, x0, yq, q, q, 1.2 * mm);
      ctx.fill();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(d.poweredQr, x0 + qp, yq + qp, q - qp * 2, q - qp * 2);
      ctx.imageSmoothingEnabled = true;
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = text;
      ctx.globalAlpha = 0.8;
      ctx.fillText(label, x0 + q + gap, yq + q / 2);
      ctx.restore();
    }
  } else if (d.format === "card") {
    drawCard(ctx, d, W, H, mm, text, accent);
  } else if (d.format === "a6") {
    drawA6(ctx, d, W, H, mm, text, accent);
  } else if (d.format === "sticker") {
    drawSticker(ctx, d, W, H, mm, text, accent);
  } else {
    // Coaster: the headline follows the top of the circle, the message the
    // bottom, with the logo and QR code in the middle.
    const r = (f.wMm / 2) * mm;
    const cy = H / 2;
    // A fine ring just inside the cut, in the highlight colour.
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.6 * mm;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3.2 * mm, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = text;
    arcText(
      ctx,
      d.headline,
      cx,
      cy,
      r - 9.5 * mm,
      "top",
      7.2 * mm,
      3.6 * mm,
      800,
      (150 * Math.PI) / 180,
    );
    ctx.globalAlpha = 0.92;
    arcText(
      ctx,
      d.sub,
      cx,
      cy,
      r - 7.8 * mm,
      "bottom",
      3.6 * mm,
      2.5 * mm,
      600,
      (165 * Math.PI) / 180,
    );
    ctx.globalAlpha = 1;

    const card = 36 * mm;
    const pad = 3 * mm;
    const top = cy - card / 2 + 3 * mm;
    // Logo (or the business name) between the headline and the code.
    const room = top - (cy - r + 15 * mm);
    if (d.logo) {
      const lh = Math.min(10 * mm, room - 1.5 * mm);
      const lw = Math.min(30 * mm, (d.logo.width / d.logo.height) * lh);
      ctx.drawImage(d.logo, cx - lw / 2, top - lh - 1.5 * mm, lw, lh);
    } else {
      ctx.fillStyle = accent;
      const name = fit(ctx, d.business.toUpperCase(), 34 * mm, 1, 4.2 * mm, 800);
      ctx.textBaseline = "bottom";
      ctx.fillText(name.lines[0] ?? "", cx, top - 1.8 * mm);
      ctx.textBaseline = "top";
    }
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, cx - card / 2, top, card, card, 3.5 * mm);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(d.qr, cx - card / 2 + pad, top + pad, card - pad * 2, card - pad * 2);
    ctx.imageSmoothingEnabled = true;
  }

  if (showGuides) {
    ctx.save();
    // Faint, so it shows where the cut is without spoiling the preview.
    ctx.setLineDash([1.5 * mm, 1.5 * mm]);
    ctx.lineWidth = Math.max(1, 0.2 * mm);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    if (f.round) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, (f.wMm / 2) * mm, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(BLEED_MM * mm, BLEED_MM * mm, W - 2 * BLEED_MM * mm, H - 2 * BLEED_MM * mm);
    }
    ctx.restore();
  }
  return c;
}

const FILE_KIND: Record<PrintFormat, string> = {
  a5: "a5-table-stand",
  square: "square-95mm",
  coaster: "coaster-95mm",
  card: "business-card-85x55mm",
  a6: "a6-thank-you-card",
  sticker: "round-sticker-50mm",
  email: "email-picture-600x200",
};

export function fileName(d: Design, ext: string): string {
  const slug =
    d.business
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "review";
  return `${slug}-${FILE_KIND[d.format]}.${ext}`;
}

// Print-ready PDF: page size = artwork plus bleed, image at 300 dpi.
export async function downloadPdf(d: Design): Promise<void> {
  const f = FORMATS[d.format];
  if (f.px) return downloadPng(d); // online pictures have no PDF
  const { jsPDF } = await import("jspdf");
  const w = f.wMm + BLEED_MM * 2;
  const h = f.hMm + BLEED_MM * 2;
  const canvas = renderDesign(d);
  const pdf = new jsPDF({
    unit: "mm",
    format: [w, h],
    orientation: w > h ? "landscape" : "portrait",
  });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h, undefined, "FAST");
  pdf.setProperties({
    title: `${d.business} review ${f.label.toLowerCase()}`,
    subject: `${f.wMm} x ${f.hMm} mm with ${BLEED_MM} mm bleed${f.round ? ", round cut" : ""}`,
    creator: "RepSuites",
  });
  pdf.save(fileName(d, "pdf"));
}

export function downloadPng(d: Design): void {
  const a = document.createElement("a");
  a.href = renderDesign(d).toDataURL("image/png");
  a.download = fileName(d, "png");
  a.click();
}
