import { footOf, type PixelImage } from "./quality";

/** Shift a pixel array by (dx, dy); pixels moved outside are dropped (reported by the caller). */
export function shiftPixels(pixels: string[], w: number, h: number, dx: number, dy: number): string[] {
  if (!dx && !dy) return pixels.slice();
  const out: string[] = Array(w * h).fill("");
  for (let y = 0; y < h; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= h) continue;
    for (let x = 0; x < w; x++) {
      const tx = x + dx;
      if (tx < 0 || tx >= w) continue;
      out[ty * w + tx] = pixels[y * w + x];
    }
  }
  return out;
}

export interface FrameFootInfo {
  index: number;
  foot: { x: number; y: number } | null;
  /** shift needed to put the feet on the anchor */
  dx: number;
  dy: number;
}

/**
 * Pivot lock: shift each frame so its feet land on the anchor.
 * - "both": x and y (idle / attack in place)
 * - "y": ground only — keeps horizontal motion drawn by the artist (walk/run cycles that sway)
 */
export function footAlignment(frames: PixelImage[], anchor: { x: number; y: number }, axes: "both" | "y" = "both"): FrameFootInfo[] {
  return frames.map((f, index) => {
    const foot = footOf(f);
    if (!foot) return { index, foot: null, dx: 0, dy: 0 };
    return { index, foot, dx: axes === "both" ? anchor.x - foot.x : 0, dy: anchor.y - foot.y };
  });
}

/** Max horizontal / vertical foot movement across frames (jitter indicator). */
export function footJitter(infos: FrameFootInfo[]): { x: number; y: number } {
  const feet = infos.map((i) => i.foot).filter((f): f is { x: number; y: number } => !!f);
  if (feet.length < 2) return { x: 0, y: 0 };
  const xs = feet.map((f) => f.x),
    ys = feet.map((f) => f.y);
  return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
}
