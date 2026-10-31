// Browser-only: the 1200 by 630 link-preview picture WhatsApp and email show
// for a report link. The business name, its score out of 100 and, when there
// is a video, a still from it with a play button. Made on a canvas, saved as
// a JPEG (WhatsApp does not show SVG previews).
// No em dashes in this copy (AGENTS.md).

const W = 1200;
const H = 630;

function scoreColour(n: number): string {
  return n >= 75 ? "#059669" : n >= 50 ? "#d97706" : "#dc2626";
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// A still from a video file (a local File, or our public storage link which
// allows cross-origin reads). Null if the browser cannot decode it.
export function videoFrame(src: File | string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    let done = false;
    const finish = (c: HTMLCanvasElement | null) => {
      if (done) return;
      done = true;
      if (typeof src !== "string") URL.revokeObjectURL(url);
      v.removeAttribute("src");
      resolve(c);
    };
    setTimeout(() => finish(null), 10000);
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1.5, (v.duration || 3) / 3);
    };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        c.width = v.videoWidth || 1280;
        c.height = v.videoHeight || 720;
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        finish(c);
      } catch {
        finish(null);
      }
    };
    v.onerror = () => finish(null);
    v.src = url;
  });
}

// Shrinks the font until the text fits on at most two lines.
function fitLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number) {
  for (let size = start; size >= 36; size -= 4) {
    ctx.font = `800 ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxW))
      return { size, lines };
  }
  ctx.font = `800 36px system-ui, sans-serif`;
  return { size: 36, lines: [text.slice(0, 40)] };
}

export async function makeOgCard(input: {
  name: string;
  score: number | null;
  video: boolean;
  still?: HTMLCanvasElement | string | null; // a canvas or an image data/https URL
}): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  // Background: the video still, darkened, or the RepSuites navy.
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0f172a");
  g.addColorStop(1, "#1e293b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const still =
    typeof input.still === "string" ? await loadImage(input.still) : (input.still ?? null);
  if (still) {
    const sw = still.width;
    const sh = still.height;
    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(still, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, "rgba(15,23,42,0.35)");
    shade.addColorStop(1, "rgba(15,23,42,0.9)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
  }

  // Brand, top left.
  ctx.fillStyle = "#f5b324";
  ctx.font = "800 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("RepSuites", 60, 52);

  // Score, top right.
  if (input.score !== null) {
    const cx = W - 140;
    const cy = 140;
    ctx.beginPath();
    ctx.arc(cx, cy, 92, 0, Math.PI * 2);
    ctx.fillStyle = scoreColour(input.score);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 72px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(String(input.score), cx, cy - 8);
    ctx.font = "700 26px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText("out of 100", cx, cy + 44);
    ctx.textAlign = "left";
  }

  // Play button in the middle.
  if (input.video) {
    const cx = W / 2;
    const cy = H / 2 - 30;
    ctx.beginPath();
    ctx.arc(cx, cy, 78, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy - 38);
    ctx.lineTo(cx + 42, cy);
    ctx.lineTo(cx - 24, cy + 38);
    ctx.closePath();
    ctx.fillStyle = "#0f172a";
    ctx.fill();
  }

  // Name and label, bottom left.
  const fit = fitLines(ctx, input.name, W - 120, 72);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  const label = input.video ? "A video about your Google report" : "Your free Google report";
  let y = H - 60 - (fit.lines.length - 1) * (fit.size * 1.1);
  ctx.font = "600 32px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = "#f5b324";
  ctx.fillText(label, 60, y - fit.size - 18);
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${fit.size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  for (const l of fit.lines) {
    ctx.fillText(l, 60, y);
    y += fit.size * 1.1;
  }

  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.85));
}
