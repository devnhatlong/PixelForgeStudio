import type { RgbaImage } from "@/lib/png-to-pixel";
import type { NormalizeInfo, Point2, SpritePreset } from "@/types/sprite";

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounding box of pixels with alpha ≥ threshold, or null when the image is empty. */
export function alphaBBox(img: RgbaImage, threshold = 128): BBox | null {
  const { width: w, height: h, data } = img;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Foot point: x = mean x of opaque pixels in the bottom band of the bbox (≈3% of its height),
 * y = lowest opaque row. Robust to a sword tip or robe hem sticking out sideways.
 */
export function findFoot(img: RgbaImage, bbox: BBox, threshold = 128): Point2 {
  const { width: w, data } = img;
  const band = Math.max(1, Math.round(bbox.h * 0.03));
  let sum = 0,
    n = 0;
  for (let y = bbox.y + bbox.h - band; y < bbox.y + bbox.h; y++)
    for (let x = bbox.x; x < bbox.x + bbox.w; x++)
      if (data[(y * w + x) * 4 + 3] >= threshold) {
        sum += x;
        n++;
      }
  return { x: n ? sum / n : bbox.x + bbox.w / 2, y: bbox.y + bbox.h - 1 };
}

export interface Layout {
  scale: number;
  contentWidth: number;
  contentHeight: number;
  offsetX: number;
  offsetY: number;
  overflow: { left: number; right: number; top: number; bottom: number };
}

/**
 * Where the cropped character goes on the target canvas. Uniform scale only (never distorts):
 * - default: scale so the bbox height becomes preset.contentHeight;
 * - `scale` override: reuse the master's scale so outfit variants keep the same body size.
 * The feet are placed exactly on preset.footAnchor.
 */
export function computeLayout(bbox: BBox, foot: Point2, preset: SpritePreset, scaleOverride?: number | null): Layout {
  const scale = scaleOverride && scaleOverride > 0 ? scaleOverride : preset.contentHeight / bbox.h;
  const contentWidth = Math.max(1, Math.round(bbox.w * scale));
  const contentHeight = Math.max(1, Math.round(bbox.h * scale));
  const footRelX = Math.min(contentWidth - 1, Math.floor((foot.x - bbox.x + 0.5) * scale));
  const offsetX = preset.footAnchor.x - footRelX;
  const offsetY = preset.footAnchor.y - contentHeight + 1;
  const W = preset.canvas.width;
  const H = preset.canvas.height;
  return {
    scale,
    contentWidth,
    contentHeight,
    offsetX,
    offsetY,
    overflow: {
      left: Math.max(0, -offsetX),
      right: Math.max(0, offsetX + contentWidth - W),
      top: Math.max(0, -offsetY),
      bottom: Math.max(0, offsetY + contentHeight - H),
    },
  };
}

export function hasOverflow(l: Layout): boolean {
  return l.overflow.left + l.overflow.right + l.overflow.top + l.overflow.bottom > 0;
}

export function cropRgba(img: RgbaImage, b: BBox): RgbaImage {
  const out = new Uint8ClampedArray(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) {
    const s = ((b.y + y) * img.width + b.x) * 4;
    out.set(img.data.subarray(s, s + b.w * 4), y * b.w * 4);
  }
  return { width: b.w, height: b.h, data: out };
}

/** Paste a content pixel block onto an empty canvas at the offset (pixels outside are clipped). */
export function placePixels(content: string[], cw: number, ch: number, offsetX: number, offsetY: number, W: number, H: number): string[] {
  const out: string[] = Array(W * H).fill("");
  for (let y = 0; y < ch; y++) {
    const ty = y + offsetY;
    if (ty < 0 || ty >= H) continue;
    for (let x = 0; x < cw; x++) {
      const tx = x + offsetX;
      if (tx < 0 || tx >= W) continue;
      const p = content[y * cw + x];
      if (p) out[ty * W + tx] = p;
    }
  }
  return out;
}

export function toNormalizeInfo(layout: Layout, bbox: BBox, foot: Point2, src: RgbaImage, scaleMode: NormalizeInfo["scaleMode"]): NormalizeInfo {
  return {
    scaleMode,
    scale: layout.scale,
    contentWidth: layout.contentWidth,
    contentHeight: layout.contentHeight,
    offsetX: layout.offsetX,
    offsetY: layout.offsetY,
    sourceBBox: bbox,
    sourceFoot: foot,
    sourceSize: { width: src.width, height: src.height },
  };
}
