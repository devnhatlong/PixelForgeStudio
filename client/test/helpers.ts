import type { RgbaImage } from "@/lib/png-to-pixel";

export type RGBA = [number, number, number, number];
export const WHITE: RGBA = [255, 255, 255, 255];

export function solid(w: number, h: number, c: RGBA): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(c, i * 4);
  return { width: w, height: h, data };
}

export function fillRect(img: RgbaImage, x0: number, y0: number, w: number, h: number, c: RGBA) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.data.set(c, (y * img.width + x) * 4);
}

export function px(img: RgbaImage, x: number, y: number): RGBA {
  const o = (y * img.width + x) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
}

/**
 * Synthetic "AI output": white background, a dark-outlined body block with a white enclosed patch (eye/robe)
 * and a 1px light-grey anti-aliasing halo around it.
 */
export function fakeCharacter(w = 200, h = 300): RgbaImage {
  const img = solid(w, h, WHITE);
  // halo ring
  fillRect(img, 59, 39, 82, 222, [200, 200, 200, 255]);
  // outline + body
  fillRect(img, 60, 40, 80, 220, [20, 20, 30, 255]);
  fillRect(img, 64, 44, 72, 212, [180, 40, 40, 255]);
  // enclosed white area (must survive edge-mode cleanup)
  fillRect(img, 90, 80, 20, 20, WHITE);
  return img;
}
