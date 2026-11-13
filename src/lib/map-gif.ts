// The moving map for emails: 25 dots fill in one by one, with the same colours
// as the report map (blue top 3, amber 4 to 10, red 11 to 20, dark with a white cross = missing).
// Pure: returns GIF bytes. The centre dot (the business's own street) gets
// a white ring. Email apps play GIFs; WhatsApp shows the first frame.
import { GIFEncoder } from "gifenc";

const PALETTE: [number, number, number][] = [
  [11, 29, 58], // 0 navy background
  [31, 111, 209], // 1 blue (top 3)
  [240, 160, 32], // 2 amber (4 to 10)
  [217, 58, 63], // 3 red (11 to 20)
  [203, 213, 225], // 4 grey
  [255, 255, 255], // 5 white
  [30, 52, 92], // 6 empty slot
  [30, 41, 59], // 7 missing (dark, white ring)
];

function colourOf(v: number | null): number {
  if (v === -1) return 4;
  if (v === null) return 7;
  if (v <= 3) return 1;
  if (v <= 10) return 2;
  return 3;
}

export function mapGif(ranks: (number | null)[], size = 420): Uint8Array {
  const W = size;
  const cell = W / 5;
  const r = cell * 0.36;
  const base = new Uint8Array(W * W); // all navy (index 0)
  const disc = (px: Uint8Array, cx: number, cy: number, rad: number, c: number) => {
    const x0 = Math.max(0, Math.floor(cx - rad)),
      x1 = Math.min(W - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad)),
      y1 = Math.min(W - 1, Math.ceil(cy + rad));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) px[y * W + x] = c;
  };
  const centre = (i: number) =>
    [(i % 5) * cell + cell / 2, Math.floor(i / 5) * cell + cell / 2] as const;
  for (let i = 0; i < 25; i++) {
    const [cx, cy] = centre(i);
    disc(base, cx, cy, r, 6);
  }
  const gif = GIFEncoder();
  const frame = base.slice();
  const list = ranks.slice(0, 25);
  // Ring for "your street" first, so it shows from the first frame.
  const [mx, my] = centre(12);
  disc(frame, mx, my, r + 5, 5);
  disc(frame, mx, my, r, 6);
  gif.writeFrame(frame.slice(), W, W, { palette: PALETTE, delay: 400, repeat: 0 });
  list.forEach((v, i) => {
    const [cx, cy] = centre(i);
    const c = colourOf(v);
    if (c === 7) {
      // Missing: white ring round a dark dot with a white cross.
      disc(frame, cx, cy, r, 5);
      disc(frame, cx, cy, r - 4, 7);
      for (let d = -r * 0.45; d <= r * 0.45; d += 0.5)
        for (let w = -2; w <= 2; w++) {
          const a = Math.round(cy + d) * W + Math.round(cx + d + w);
          const b2 = Math.round(cy + d) * W + Math.round(cx - d + w);
          frame[a] = 5;
          frame[b2] = 5;
        }
    } else disc(frame, cx, cy, r, c);
    gif.writeFrame(frame.slice(), W, W, { delay: i === list.length - 1 ? 3000 : 90 });
  });
  gif.finish();
  return gif.bytes();
}
