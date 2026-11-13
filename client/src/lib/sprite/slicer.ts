import type { RgbaImage } from "@/lib/png-to-pixel";
import type { CleanupConfig } from "@/types/sprite";
import { removeBackground } from "./background";
import { cropRgba, type BBox } from "./normalize";

export type Rect = BBox;

export interface GridSpec {
  rows: number;
  cols: number;
  /** pixels trimmed from the left/right and top/bottom of the sheet */
  marginX: number;
  marginY: number;
  /** spacing between cells */
  gapX: number;
  gapY: number;
}

/** Uniform grid cells, row-major. Cell sizes absorb rounding so the grid always covers the sheet exactly. */
export function gridCells(width: number, height: number, g: GridSpec): Rect[] {
  const rows = Math.max(1, Math.floor(g.rows));
  const cols = Math.max(1, Math.floor(g.cols));
  const innerW = width - 2 * g.marginX - (cols - 1) * g.gapX;
  const innerH = height - 2 * g.marginY - (rows - 1) * g.gapY;
  if (innerW < cols || innerH < rows) return [];
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    const y0 = Math.round(g.marginY + r * (innerH / rows + g.gapY));
    const y1 = Math.round(g.marginY + (r + 1) * (innerH / rows) + r * g.gapY);
    for (let c = 0; c < cols; c++) {
      const x0 = Math.round(g.marginX + c * (innerW / cols + g.gapX));
      const x1 = Math.round(g.marginX + (c + 1) * (innerW / cols) + c * g.gapX);
      out.push({ x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) });
    }
  }
  return out;
}

/** 1 = foreground (not background), using the same cleanup as the sprite pipeline. */
export function foregroundMask(img: RgbaImage, cleanup: CleanupConfig): Uint8Array {
  const { removed } = removeBackground(img, cleanup);
  const fg = new Uint8Array(img.width * img.height);
  for (let i = 0; i < fg.length; i++) fg[i] = removed[i] ? 0 : 1;
  return fg;
}

/** Runs of `true` separated by at least `minGap` falses; runs shorter than minSize are dropped. */
function runs(has: boolean[], minGap: number, minSize: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  let lastOn = -1;
  for (let i = 0; i <= has.length; i++) {
    const on = i < has.length && has[i];
    if (on) {
      if (start < 0) start = i;
      lastOn = i;
    } else if (start >= 0 && (i === has.length || i - lastOn >= minGap)) {
      if (lastOn - start + 1 >= minSize) out.push([start, lastOn]);
      start = -1;
    }
  }
  return out;
}

/**
 * Auto-detect sprites on a sheet: split into horizontal bands separated by empty rows, then each band into
 * segments separated by empty columns; each piece is trimmed to its content. Works for AI sheets whose
 * frames are not on an exact grid. Returned row-major.
 */
export function detectSprites(img: RgbaImage, opts: { cleanup: CleanupConfig; minGap?: number; minSize?: number; mask?: Uint8Array }): Rect[] {
  const { width: W, height: H } = img;
  const minGap = Math.max(1, opts.minGap ?? Math.max(2, Math.round(Math.min(W, H) / 200)));
  const minSize = Math.max(1, opts.minSize ?? Math.max(4, Math.round(Math.min(W, H) / 60)));
  const fg = opts.mask ?? foregroundMask(img, opts.cleanup);
  const rowHas = Array.from({ length: H }, (_, y) => {
    for (let x = 0; x < W; x++) if (fg[y * W + x]) return true;
    return false;
  });
  const out: Rect[] = [];
  for (const [y0, y1] of runs(rowHas, minGap, minSize)) {
    const colHas = Array.from({ length: W }, (_, x) => {
      for (let y = y0; y <= y1; y++) if (fg[y * W + x]) return true;
      return false;
    });
    for (const [x0, x1] of runs(colHas, minGap, minSize)) {
      // trim vertically inside the band
      let top = y1,
        bottom = y0;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
          if (fg[y * W + x]) {
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            break;
          }
      if (bottom - top + 1 >= minSize) out.push({ x: x0, y: top, w: x1 - x0 + 1, h: bottom - top + 1 });
    }
  }
  return out;
}

/** Group rects into rows (by vertical overlap) — used for "select row" buttons. */
export function groupRows(rects: Rect[]): number[][] {
  const rows: { y0: number; y1: number; idx: number[] }[] = [];
  rects.forEach((r, i) => {
    const cy = r.y + r.h / 2;
    const row = rows.find((g) => cy >= g.y0 && cy <= g.y1);
    if (row) {
      row.idx.push(i);
      row.y0 = Math.min(row.y0, r.y);
      row.y1 = Math.max(row.y1, r.y + r.h);
    } else rows.push({ y0: r.y, y1: r.y + r.h, idx: [i] });
  });
  rows.sort((a, b) => a.y0 - b.y0);
  return rows.map((g) => g.idx.sort((a, b) => rects[a].x - rects[b].x));
}

export function cropCells(img: RgbaImage, rects: Rect[]): RgbaImage[] {
  return rects.map((r) => cropRgba(img, { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(r.w, img.width - r.x), h: Math.min(r.h, img.height - r.y) }));
}
