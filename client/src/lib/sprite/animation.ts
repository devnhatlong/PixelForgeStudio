import { medianCut, pixelizeRgba, type RgbaImage } from "@/lib/png-to-pixel";
import { rgbToHex } from "@/lib/color";
import type { CleanupConfig, SpritePreset } from "@/types/sprite";
import { removeBackground } from "./background";
import { alphaBBox, computeLayout, cropRgba, findFoot, hasOverflow, placePixels, type BBox } from "./normalize";

export type FrameAlign = "cell" | "foot";

export interface AnimationOptions {
  preset: SpritePreset;
  cleanup: CleanupConfig;
  maxColors: number;
  alphaThreshold: number;
  resizeMethod: "box" | "nearest";
  /** fixed palette (e.g. the master's); otherwise one palette is computed for ALL frames */
  palette?: string[] | null;
  /**
   * cell = keep each frame's position inside its cell (needs equal cell sizes; best for real grids — the artist's
   *        motion is preserved);
   * foot = align every frame by its own feet (for auto-detected, trimmed frames).
   */
  align: FrameAlign;
}

export interface AnimationResult {
  /** canvas-sized pixel arrays, one per frame ("" = transparent) */
  frames: string[][];
  palette: string[];
  scale: number;
  warnings: string[];
}

/** One shared palette for every frame → colours never flicker between frames. */
function sharedPalette(images: RgbaImage[], maxColors: number, alphaThreshold: number): string[] {
  const colors: [number, number, number][] = [];
  const total = images.reduce((n, im) => n + im.width * im.height, 0);
  const step = Math.max(1, Math.floor(total / 150_000));
  let k = 0;
  for (const im of images)
    for (let i = 0; i < im.width * im.height; i++, k++) {
      if (k % step) continue;
      const o = i * 4;
      if (im.data[o + 3] < alphaThreshold) continue;
      colors.push([im.data[o], im.data[o + 1], im.data[o + 2]]);
    }
  return medianCut(colors, maxColors).map((c) => rgbToHex(c[0], c[1], c[2]));
}

/**
 * Turn sheet cells into animation frames on the preset canvas: same uniform scale for all frames,
 * feet on the preset anchor, one palette. Pure.
 */
export function buildAnimationFrames(cells: RgbaImage[], o: AnimationOptions): AnimationResult {
  const W = o.preset.canvas.width;
  const H = o.preset.canvas.height;
  const warnings: string[] = [];
  const cleaned = cells.map((c) => removeBackground(c, o.cleanup).image);
  const boxes = cleaned.map((c) => alphaBBox(c, o.alphaThreshold));
  const empty = boxes.filter((b) => !b).length;
  if (empty) warnings.push(`${empty} ô trống (không có nhân vật) — để trống trong animation.`);
  const valid = boxes.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  if (!valid.length) return { frames: cells.map(() => Array(W * H).fill("")), palette: [], scale: 0, warnings: ["Không có frame nào có nội dung."] };

  let align = o.align;
  if (align === "cell" && !cells.every((c) => c.width === cells[0].width && c.height === cells[0].height)) {
    align = "foot";
    warnings.push("Các ô khác kích thước — chuyển sang căn theo chân từng frame.");
  }

  // crops that will be pixelized + how they are placed
  type Plan = { crop: RgbaImage; w: number; h: number; ox: number; oy: number } | null;
  let plans: Plan[];
  let scale: number;
  if (align === "cell") {
    // union of all content boxes, in cell coordinates → same crop window for every frame
    const u = valid.reduce<BBox>((acc, i) => {
      const b = boxes[i]!;
      const x0 = Math.min(acc.x, b.x),
        y0 = Math.min(acc.y, b.y);
      const x1 = Math.max(acc.x + acc.w, b.x + b.w),
        y1 = Math.max(acc.y + acc.h, b.y + b.h);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }, { ...boxes[valid[0]]! });
    // feet reference: lowest content row of the union, x = mean foot x of all frames
    const footX = valid.reduce((s, i) => s + findFoot(cleaned[i], boxes[i]!, o.alphaThreshold).x, 0) / valid.length;
    const layout = computeLayout(u, { x: footX, y: u.y + u.h - 1 }, o.preset);
    scale = layout.scale;
    if (hasOverflow(layout)) warnings.push("Khung chuyển động rộng hơn canvas — phần tràn bị cắt (thử canvas lớn hơn).");
    plans = cleaned.map((c, i) => (boxes[i] ? { crop: cropRgba(c, u), w: layout.contentWidth, h: layout.contentHeight, ox: layout.offsetX, oy: layout.offsetY } : null));
  } else {
    const maxH = Math.max(...valid.map((i) => boxes[i]!.h));
    scale = o.preset.contentHeight / maxH;
    let overflow = false;
    plans = cleaned.map((c, i) => {
      const b = boxes[i];
      if (!b) return null;
      const l = computeLayout(b, findFoot(c, b, o.alphaThreshold), o.preset, scale);
      overflow ||= hasOverflow(l);
      return { crop: cropRgba(c, b), w: l.contentWidth, h: l.contentHeight, ox: l.offsetX, oy: l.offsetY };
    });
    if (overflow) warnings.push("Có frame tràn canvas — phần tràn bị cắt.");
  }

  const palette =
    o.palette && o.palette.length ? o.palette : sharedPalette(plans.filter((p): p is NonNullable<Plan> => !!p).map((p) => p.crop), o.maxColors, o.alphaThreshold);
  const frames = plans.map((p) => {
    if (!p) return Array(W * H).fill("");
    const { pixels } = pixelizeRgba(p.crop, { width: p.w, height: p.h, maxColors: o.maxColors, palette, alphaThreshold: o.alphaThreshold, resizeMethod: o.resizeMethod });
    return placePixels(pixels, p.w, p.h, p.ox, p.oy, W, H);
  });
  const used = Array.from(new Set(frames.flat().filter(Boolean)));
  return { frames, palette: used, scale, warnings };
}
