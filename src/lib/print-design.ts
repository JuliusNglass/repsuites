// Printable review cards: coaster (95 mm square, round cut) and A5 table
// stand. Drawn on a canvas at 300 dpi with a 3 mm bleed, then saved as a
// print-ready PDF (exact size) or PNG. Client-only (uses the browser canvas).
// No em dashes in this copy (AGENTS.md).

export type PrintFormat = "coaster" | "a5";

export const FORMATS: Record<
  PrintFormat,
  { label: string; wMm: number; hMm: number; round: boolean }
> = {
  coaster: { label: "Coaster (95 mm, round cut)", wMm: 95, hMm: 95, round: true },
  a5: { label: "Table stand (A5, 148 x 210 mm)", wMm: 148, hMm: 210, round: false },
};

export const BLEED_MM = 3;
const DPI = 300;
const PX_PER_MM = DPI / 25.4;

// Short, warm and within Google's rules: every customer is invited (good,
// bad or brilliant), nothing is offered in return for a review.
export const MESSAGES: { headline: string; sub: string }[] = [
  {
    headline: "How did we do today?",
    sub: "Good, bad or brilliant, we want to hear it. Scan to leave a quick review.",
  },
  {
    headline: "Thank you for your business",
    sub: "Your review helps other people find us. It takes 30 seconds. Scan here.",
  },
  {
    headline: "Every review helps a local business",
    sub: "Point your camera at the code and tell us about your visit. We read every one.",
  },
  {
    headline: "Got 30 seconds?",
    sub: "Scan, tap the stars, say a few words. It makes a real difference to us.",
  },
  {
    headline: "Your opinion shapes what we do",
    sub: "Share your experience in a quick review. Scan with your phone camera.",
  },
];

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

// Draw the full artwork (including bleed) and return the canvas.
// showGuides adds the cut line and safe area for the on-screen preview only.
export function renderDesign(d: Design, showGuides = false, scale = 1): HTMLCanvasElement {
  const f = FORMATS[d.format];
  const W = px(f.wMm + BLEED_MM * 2) * scale;
  const H = px(f.hMm + BLEED_MM * 2) * scale;
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
    const footerH = d.footer ? 12 * mm : 4 * mm;
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
  } else {
    // Coaster: everything inside the round cut.
    const r = (f.wMm / 2) * mm;
    const cy = H / 2;
    const maxW = r * 1.25;
    let y = cy - r + 13 * mm;
    if (d.logo) {
      const lh = 11 * mm;
      const lw = Math.min(maxW * 0.7, (d.logo.width / d.logo.height) * lh);
      ctx.drawImage(d.logo, cx - lw / 2, y - 3 * mm, lw, lh);
      y += lh;
    } else {
      ctx.fillStyle = accent;
      const name = fit(ctx, d.business.toUpperCase(), maxW * 0.85, 2, 5 * mm, 800);
      y = drawLines(ctx, name.lines, cx, y, name.size * 1.15) + 1 * mm;
    }
    ctx.fillStyle = text;
    const head = fit(ctx, d.headline, maxW, 2, 7 * mm, 800);
    y = drawLines(ctx, head.lines, cx, y, head.size * 1.1) + 2.5 * mm;

    const card = 40 * mm;
    const pad = 3 * mm;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, cx - card / 2, y, card, card, 3.5 * mm);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(d.qr, cx - card / 2 + pad, y + pad, card - pad * 2, card - pad * 2);
    ctx.imageSmoothingEnabled = true;
    y += card + 2.5 * mm;
    ctx.fillStyle = text;
    ctx.globalAlpha = 0.9;
    const sub = fit(ctx, d.sub, maxW * 0.8, 2, 3.4 * mm, 600);
    drawLines(ctx, sub.lines, cx, y, sub.size * 1.3);
    ctx.globalAlpha = 1;
  }

  if (showGuides) {
    ctx.save();
    ctx.setLineDash([3 * mm, 2 * mm]);
    ctx.lineWidth = Math.max(1, 0.4 * mm);
    ctx.strokeStyle = "rgba(255, 0, 90, 0.85)";
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

export function fileName(d: Design, ext: string): string {
  const slug =
    d.business
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "review";
  return `${slug}-${d.format === "a5" ? "a5-table-stand" : "coaster-95mm"}.${ext}`;
}

// Print-ready PDF: page size = artwork plus bleed, image at 300 dpi.
export async function downloadPdf(d: Design): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const f = FORMATS[d.format];
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
    title: `${d.business} review ${d.format === "a5" ? "table stand" : "coaster"}`,
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
