import { pixelizeRgba, type RgbaImage } from "@/lib/png-to-pixel";
import { hexToRgb } from "@/lib/color";
import type { CleanupConfig, NormalizeInfo, PixelConfig, SpritePreset } from "@/types/sprite";
import { removeBackground, type CleanupResult } from "./background";
import { alphaBBox, computeLayout, cropRgba, findFoot, hasOverflow, placePixels, toNormalizeInfo, type BBox, type Layout } from "./normalize";

export interface PipelineOptions {
  preset: SpritePreset;
  cleanup: CleanupConfig;
  pixel: PixelConfig;
  /** reuse a master's output scale (keeps body size identical across outfits) */
  scaleOverride?: number | null;
  /** after quantizing, replace colours within maxDistance of one of these with that exact colour */
  snapPalette?: { colors: string[]; maxDistance: number } | null;
}

/** Map every colour to the closest snap colour if it is within maxDistance (Euclidean RGB); others are kept. */
export function snapToPalette(pixels: string[], colors: string[], maxDistance: number): string[] {
  if (!colors.length) return pixels;
  const targets = colors.map((c) => [c, hexToRgb(c)] as const);
  const memo = new Map<string, string>();
  return pixels.map((p) => {
    if (!p) return p;
    let out = memo.get(p);
    if (out === undefined) {
      const [r, g, b] = hexToRgb(p);
      let best = p,
        bd = maxDistance * maxDistance;
      for (const [hex, [tr, tg, tb]] of targets) {
        const d = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2;
        if (d <= bd) {
          bd = d;
          best = hex;
        }
      }
      out = best;
      memo.set(p, out);
    }
    return out;
  });
}

export interface PipelineResult {
  cleanup: CleanupResult;
  bbox: BBox | null;
  layout: Layout | null;
  normalize: NormalizeInfo | null;
  /** canvas-sized pixel array ("#rrggbb" | "") */
  pixels: string[];
  palette: string[];
  warnings: string[];
}

/**
 * source image → background cleanup → bbox/foot → uniform scale + pixelize → place on preset canvas.
 * Pure and deterministic; the source image is never modified, so it can be re-run when the preset changes.
 */
export function runSpritePipeline(source: RgbaImage, opts: PipelineOptions): PipelineResult {
  const { preset, pixel } = opts;
  const W = preset.canvas.width;
  const H = preset.canvas.height;
  const warnings: string[] = [];
  const cleanup = removeBackground(source, opts.cleanup);
  const bbox = alphaBBox(cleanup.image, pixel.alphaThreshold);
  if (!bbox) {
    return { cleanup, bbox: null, layout: null, normalize: null, pixels: Array(W * H).fill(""), palette: [], warnings: ["Ảnh trống sau khi xóa nền - giảm tolerance hoặc tắt xóa nền."] };
  }
  const foot = findFoot(cleanup.image, bbox, pixel.alphaThreshold);
  const layout = computeLayout(bbox, foot, preset, opts.scaleOverride);
  if (hasOverflow(layout)) {
    const o = layout.overflow;
    warnings.push(`Nhân vật tràn canvas (trái ${o.left}, phải ${o.right}, trên ${o.top}, dưới ${o.bottom} px) - phần tràn bị cắt.`);
  }
  if (bbox.x === 0 || bbox.y === 0 || bbox.x + bbox.w === source.width || bbox.y + bbox.h === source.height) {
    warnings.push("Nhân vật chạm mép ảnh nguồn - có thể ảnh gốc đã bị cắt mất chân/đầu/vũ khí.");
  }
  if (opts.scaleOverride) {
    const fitScale = preset.contentHeight / bbox.h;
    const diff = Math.abs(fitScale - opts.scaleOverride) / fitScale;
    if (diff > 0.12) warnings.push(`Chiều cao nhân vật khác master ${Math.round(diff * 100)}% - kiểm tra lại tỉ lệ (có thể do mũ/tóc hoặc ảnh sinh lệch).`);
  }
  const cropped = cropRgba(cleanup.image, bbox);
  const { pixels: content } = pixelizeRgba(cropped, {
    width: layout.contentWidth,
    height: layout.contentHeight,
    maxColors: pixel.maxColors,
    palette: pixel.palette && pixel.palette.length ? pixel.palette : null,
    alphaThreshold: pixel.alphaThreshold,
    resizeMethod: pixel.resizeMethod,
  });
  const snapped = opts.snapPalette ? snapToPalette(content, opts.snapPalette.colors, opts.snapPalette.maxDistance) : content;
  const pixels = placePixels(snapped, layout.contentWidth, layout.contentHeight, layout.offsetX, layout.offsetY, W, H);
  const palette = Array.from(new Set(pixels.filter(Boolean)));
  return {
    cleanup,
    bbox,
    layout,
    normalize: toNormalizeInfo(layout, bbox, foot, source, opts.scaleOverride ? "match-master" : "fit-height"),
    pixels,
    palette,
    warnings,
  };
}
