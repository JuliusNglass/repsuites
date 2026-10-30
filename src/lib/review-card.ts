// Draws a square 1080 x 1080 "review card" picture for a Google post, in the
// business's own colours: the business name, 5 stars, a short quote from a
// real review and the reviewer's first name. Browser only (uses canvas).
import { brandTheme, luminance, shade, textOn } from "./brand";
import { THEMES, type Theme } from "./print-design";

export interface CardInput {
  business: string;
  quote: string;
  by: string | null;
  primary: string | null; // brand colour, e.g. "#0b1d3a"
  secondary: string | null;
  logo?: HTMLImageElement | null; // the business's logo, shown instead of its name
  // The look: a colour theme from the QR designer, or the QR stand's photo
  // with a dark layer over it. Without one, the brand colours.
  themeId?: string | null;
  photo?: HTMLImageElement | null;
}

function themeFor(input: CardInput): Theme | null {
  if (!input.themeId || input.themeId === "brand")
    return input.primary ? brandTheme(input.primary, input.secondary) : null;
  return THEMES.find((t) => t.id === input.themeId) ?? null;
}

const SIZE = 1080;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

// Splits text into lines that fit the width.
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > width && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + rad * Math.cos(a);
    const y = cy + rad * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawReviewCard(input: CardInput): string {
  const theme = themeFor(input);
  const bg = theme ? theme.bg[0] : (input.primary ?? "#0f172a");
  let text = theme ? theme.text : textOn(bg);
  let accent = theme ? theme.accent : (input.secondary ?? "#f5b324");
  if (Math.abs(luminance(accent) - luminance(bg)) < 0.15) accent = "#f5b324";
  if (Math.abs(luminance(accent) - luminance(bg)) < 0.15) accent = text;

  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext("2d")!;

  // Background: the theme's gradient (or the brand colour) with a large
  // faint circle, or the QR stand's photo with a dark layer so words read.
  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, theme ? theme.bg[0] : shade(bg, 0.08));
  grad.addColorStop(1, theme ? theme.bg[1] : shade(bg, -0.18));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const photo = input.photo;
  if (photo && photo.width && photo.height) {
    const k = Math.max(SIZE / photo.width, SIZE / photo.height);
    const w = photo.width * k;
    const h = photo.height * k;
    ctx.drawImage(photo, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
    ctx.fillStyle = "rgba(8, 12, 24, 0.6)";
    ctx.fillRect(0, 0, SIZE, SIZE);
    text = "#ffffff";
    if (luminance(accent) < 0.35) accent = "#f5b324";
  } else {
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = text;
    ctx.beginPath();
    ctx.arc(SIZE * 0.85, SIZE * 0.15, 320, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // The logo at the top (on a white rounded panel so any logo reads well),
  // or the business name when there is no logo.
  if (input.logo && input.logo.width && input.logo.height) {
    const maxW = 520;
    const maxH = 150;
    const k = Math.min(maxW / input.logo.width, maxH / input.logo.height);
    const w = input.logo.width * k;
    const h = input.logo.height * k;
    const pad = 22;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(SIZE / 2 - w / 2 - pad, 205 - h - pad, w + pad * 2, h + pad * 2, 24);
    ctx.fill();
    ctx.drawImage(input.logo, SIZE / 2 - w / 2, 205 - h, w, h);
  } else {
    drawName();
  }
  function drawName() {
    ctx.fillStyle = accent;
    let nameSize = 56;
    ctx.font = `800 ${nameSize}px ${FONT}`;
    while (ctx.measureText(input.business.toUpperCase()).width > SIZE - 160 && nameSize > 30) {
      nameSize -= 2;
      ctx.font = `800 ${nameSize}px ${FONT}`;
    }
    ctx.fillText(input.business.toUpperCase(), SIZE / 2, 170);
  }

  // Five stars.
  ctx.fillStyle = "#f5b324";
  for (let i = 0; i < 5; i++) star(ctx, SIZE / 2 + (i - 2) * 78, 290, 30);

  // The quote, as large as fits in 6 lines.
  ctx.fillStyle = text;
  const quote = `“${input.quote}”`;
  let size = 76;
  let lines: string[] = [];
  for (; size >= 36; size -= 4) {
    ctx.font = `700 ${size}px ${FONT}`;
    lines = wrap(ctx, quote, SIZE - 200);
    if (lines.length <= 6) break;
  }
  const lh = size * 1.25;
  const top = 560 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, SIZE / 2, top + i * lh));

  // Who said it.
  ctx.font = `600 40px ${FONT}`;
  ctx.globalAlpha = 0.85;
  if (input.by) ctx.fillText(input.by, SIZE / 2, Math.min(930, top + lines.length * lh + 50));
  ctx.globalAlpha = 0.6;
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText("Google review", SIZE / 2, 1010);
  ctx.globalAlpha = 1;

  return c.toDataURL("image/png");
}

// Loads a picture from a web address so it can be drawn (needs CORS).
export function loadPicture(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
