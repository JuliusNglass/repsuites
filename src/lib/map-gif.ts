// The moving map for emails: 25 dots fill in one by one (green = top 3,
// amber = 4 to 10, red = lower, grey = not checked), then the picture holds.
// Pure: returns GIF bytes. The centre dot (the business's own street) gets
// a white ring. Email apps play GIFs; WhatsApp shows the first frame.
import { GIFEncoder } from "gifenc";

const PALETTE: [number, number, number][] = [
  [11, 29, 58], // 0 navy background
  [22, 163, 74], // 1 green
  [245, 158, 11], // 2 amber
  [239, 68, 68], // 3 red
  [203, 213, 225], // 4 grey
  [255, 255, 255], // 5 white
  [30, 52, 92], // 6 empty slot
];

function colourOf(v: number | null): number {
  if (v === -1) return 4;
  if (v !== null && v <= 3) return 1;
  if (v !== null && v <= 10) return 2;
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
    disc(frame, cx, cy, r, colourOf(v));
    gif.writeFrame(frame.slice(), W, W, { delay: i === list.length - 1 ? 3000 : 90 });
  });
  gif.finish();
  return gif.bytes();
}
