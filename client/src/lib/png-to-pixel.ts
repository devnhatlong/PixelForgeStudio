import type { PixelDocument } from "@/types/editor";
import { createDocument } from "./document";
import { colorDistance, hexToRgb, rgbToHex } from "./color";

export type ResizeMethod = "box" | "nearest";

export interface ConvertOptions {
  width: number;
  height: number;
  maxColors: number;
  /** optional fixed palette to snap to */
  palette?: string[] | null;
  alphaThreshold: number; // 0..255
  /** "box" (area average, default - best for painted/AI images) or "nearest" (keeps hard pixel edges) */
  resizeMethod?: ResizeMethod;
}

/** Minimal RGBA raster, structurally compatible with the DOM ImageData. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh"));
    };
    img.src = url;
  });
}

/** Read the full-resolution RGBA pixels of an image (browser only). */
export function imageToRgba(img: HTMLImageElement): RgbaImage {
  const src = document.createElement("canvas");
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);
  return sctx.getImageData(0, 0, src.width, src.height);
}

type RGB = [number, number, number];

/** Median-cut quantization to at most maxColors colors. */
export function medianCut(colors: RGB[], maxColors: number): RGB[] {
  if (colors.length <= maxColors) return dedupe(colors);
  let buckets: RGB[][] = [colors];
  while (buckets.length < maxColors) {
    let bestIdx = -1;
    let bestRange = -1;
    let bestChannel = 0;
    buckets.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let min = 255,
          max = 0;
        for (const px of b) {
          if (px[c] < min) min = px[c];
          if (px[c] > max) max = px[c];
        }
        if (max - min > bestRange) {
          bestRange = max - min;
          bestIdx = i;
          bestChannel = c;
        }
      }
    });
    if (bestIdx < 0) break;
    const b = buckets[bestIdx].sort((a, z) => a[bestChannel] - z[bestChannel]);
    const mid = Math.floor(b.length / 2);
    buckets.splice(bestIdx, 1, b.slice(0, mid), b.slice(mid));
  }
  buckets = buckets.filter((b) => b.length > 0);
  return buckets.map((b) => {
    const sum = [0, 0, 0];
    for (const px of b) {
      sum[0] += px[0];
      sum[1] += px[1];
      sum[2] += px[2];
    }
    return [sum[0] / b.length, sum[1] / b.length, sum[2] / b.length] as RGB;
  });
}

function dedupe(colors: RGB[]): RGB[] {
  const seen = new Set<string>();
  const out: RGB[] = [];
  for (const c of colors) {
    const k = c.join(",");
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

function nearest(c: RGB, palette: RGB[]): RGB {
  let best = palette[0];
  let bd = Infinity;
  for (const p of palette) {
    const d = colorDistance(c, p);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/**
 * Downscale + quantize an RGBA raster into pixel-art cells. Pure (no DOM), so it runs in tests and workers.
 * Each output pixel is "#rrggbb" or "" (transparent).
 */
export function pixelizeRgba(src: RgbaImage, opts: ConvertOptions): { pixels: string[]; palette: string[] } {
  const { width, height } = opts;
  const data = src.data;
  const cells: (RGB | null)[] = [];
  const cw = src.width / width;
  const ch = src.height / height;
  const nearestMode = opts.resizeMethod === "nearest";
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (nearestMode) {
        const sx = Math.min(src.width - 1, Math.floor((x + 0.5) * cw));
        const sy = Math.min(src.height - 1, Math.floor((y + 0.5) * ch));
        const i = (sy * src.width + sx) * 4;
        if (data[i + 3] < opts.alphaThreshold) cells.push(null);
        else cells.push([data[i], data[i + 1], data[i + 2]]);
        continue;
      }
      // box-filter (alpha-weighted area average)
      const x0 = Math.floor(x * cw);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * cw));
      const y0 = Math.floor(y * ch);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * ch));
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      for (let yy = y0; yy < y1 && yy < src.height; yy++)
        for (let xx = x0; xx < x1 && xx < src.width; xx++) {
          const i = (yy * src.width + xx) * 4;
          const al = data[i + 3];
          r += data[i] * al;
          g += data[i + 1] * al;
          b += data[i + 2] * al;
          a += al;
          n++;
        }
      if (n === 0 || a === 0 || a / n < opts.alphaThreshold) cells.push(null);
      else cells.push([r / a, g / a, b / a]);
    }
  }

  const opaque = cells.filter((c): c is RGB => !!c).map((c) => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])] as RGB);
  const palette: RGB[] = opts.palette && opts.palette.length ? opts.palette.map((h) => hexToRgb(h)) : medianCut(opaque, opts.maxColors);
  const pixels = palette.length ? cells.map((c) => (c ? rgbToHex(...nearest(c, palette)) : "")) : cells.map(() => "");
  const used = Array.from(new Set(pixels.filter(Boolean)));
  return { pixels, palette: used };
}

export function imageToPixels(img: HTMLImageElement, opts: ConvertOptions): { pixels: string[]; palette: string[] } {
  return pixelizeRgba(imageToRgba(img), opts);
}

export function imageToDocument(img: HTMLImageElement, name: string, opts: ConvertOptions): PixelDocument {
  const doc = createDocument(name, opts.width, opts.height);
  const { pixels, palette } = imageToPixels(img, opts);
  doc.frames[0].cels[doc.layers[0].id] = pixels;
  doc.palette = palette;
  return doc;
}
