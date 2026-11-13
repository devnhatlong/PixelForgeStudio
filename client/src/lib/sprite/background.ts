import type { RgbaImage } from "@/lib/png-to-pixel";
import type { CleanupConfig } from "@/types/sprite";
import { hexToRgb, rgbToHex } from "@/lib/color";

export const DEFAULT_CLEANUP: CleanupConfig = {
  enabled: true,
  tolerance: 40,
  haloPasses: 2,
  haloTolerance: 110,
  mode: "edge",
  color: null,
};

const TRANSPARENT_ALPHA = 16;

export interface BackgroundGuess {
  /** border is already (mostly) transparent → nothing to remove */
  alreadyTransparent: boolean;
  color: string | null;
  /** share of border pixels that match the guessed colour (0..1) */
  confidence: number;
}

function dist(r: number, g: number, b: number, c: [number, number, number]) {
  const dr = r - c[0];
  const dg = g - c[1];
  const db = b - c[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function borderIndices(w: number, h: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < w; x++) {
    out.push(x);
    if (h > 1) out.push((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    out.push(y * w);
    if (w > 1) out.push(y * w + w - 1);
  }
  return out;
}

/** Guess the background colour from the image border (most common colour bucket). */
export function detectBackground(img: RgbaImage): BackgroundGuess {
  const { width: w, height: h, data } = img;
  const border = borderIndices(w, h);
  if (!border.length) return { alreadyTransparent: true, color: null, confidence: 0 };
  let transparent = 0;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const i of border) {
    const o = i * 4;
    if (data[o + 3] < TRANSPARENT_ALPHA) {
      transparent++;
      continue;
    }
    const key = ((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4);
    const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bk.n++;
    bk.r += data[o];
    bk.g += data[o + 1];
    bk.b += data[o + 2];
    buckets.set(key, bk);
  }
  if (transparent / border.length >= 0.6) return { alreadyTransparent: true, color: null, confidence: transparent / border.length };
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const bk of buckets.values()) if (!best || bk.n > best.n) best = bk;
  if (!best) return { alreadyTransparent: true, color: null, confidence: 1 };
  return {
    alreadyTransparent: false,
    color: rgbToHex(best.r / best.n, best.g / best.n, best.b / best.n),
    confidence: best.n / border.length,
  };
}

export interface CleanupResult {
  image: RgbaImage;
  /** 1 = pixel removed as background (including pixels already transparent in the source) */
  removed: Uint8Array;
  color: string | null;
  removedCount: number;
  haloRemoved: number;
}

/**
 * Remove a flat background. Never mutates the input.
 * - edge mode floods from the border so enclosed light areas (eyes, white robes) survive;
 * - halo passes peel off light fringe pixels that touch removed background and are "close-ish" to it.
 */
export function removeBackground(src: RgbaImage, cfg: CleanupConfig): CleanupResult {
  const { width: w, height: h } = src;
  const data = new Uint8ClampedArray(src.data);
  const removed = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] < TRANSPARENT_ALPHA) removed[i] = 1;

  const colorHex = cfg.color ?? detectBackground(src).color;
  if (!cfg.enabled || !colorHex) {
    for (let i = 0; i < w * h; i++) if (removed[i]) data[i * 4 + 3] = 0;
    return { image: { width: w, height: h, data }, removed, color: colorHex, removedCount: 0, haloRemoved: 0 };
  }
  const bg = hexToRgb(colorHex);
  const matches = (i: number, tol: number) => {
    const o = i * 4;
    return data[o + 3] < TRANSPARENT_ALPHA || dist(data[o], data[o + 1], data[o + 2], bg) <= tol;
  };

  let removedCount = 0;
  if (cfg.mode === "global") {
    for (let i = 0; i < w * h; i++) {
      if (!removed[i] && matches(i, cfg.tolerance)) {
        removed[i] = 1;
        removedCount++;
      }
    }
  } else {
    const visited = new Uint8Array(w * h);
    const stack: number[] = [];
    for (const i of borderIndices(w, h)) if (matches(i, cfg.tolerance)) stack.push(i);
    while (stack.length) {
      const i = stack.pop()!;
      if (visited[i]) continue;
      visited[i] = 1;
      if (!matches(i, cfg.tolerance)) continue;
      if (!removed[i]) removedCount++;
      removed[i] = 1;
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w);
      if (y < h - 1) stack.push(i + w);
    }
  }

  let haloRemoved = 0;
  for (let pass = 0; pass < cfg.haloPasses; pass++) {
    const peel: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (removed[i]) continue;
      const x = i % w;
      const y = (i - x) / w;
      const touches = (x > 0 && removed[i - 1]) || (x < w - 1 && removed[i + 1]) || (y > 0 && removed[i - w]) || (y < h - 1 && removed[i + w]);
      if (touches && matches(i, cfg.haloTolerance)) peel.push(i);
    }
    if (!peel.length) break;
    for (const i of peel) removed[i] = 1;
    haloRemoved += peel.length;
  }

  for (let i = 0; i < w * h; i++) if (removed[i]) data[i * 4 + 3] = 0;
  return { image: { width: w, height: h, data }, removed, color: colorHex, removedCount, haloRemoved };
}

/** Black/white alpha-mask view of a raster (white = kept). */
export function alphaMaskImage(img: RgbaImage, threshold = 128): RgbaImage {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  for (let i = 0; i < img.width * img.height; i++) {
    const v = img.data[i * 4 + 3] >= threshold ? 255 : 0;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}
