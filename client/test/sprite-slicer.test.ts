import { describe, expect, it } from "vitest";
import { detectSprites, gridCells, groupRows, cropCells } from "@/lib/sprite/slicer";
import { buildAnimationFrames } from "@/lib/sprite/animation";
import { DEFAULT_CLEANUP } from "@/lib/sprite/background";
import { getPreset } from "@/lib/sprite/presets";
import { WHITE, fillRect, solid } from "./helpers";

const preset = getPreset("HY_CHARACTER_V1")!;

/** 2 rows × 3 cols sheet, 40×60 cells, white bg; each figure is a dark block that moves 2px right per frame. */
function sheet() {
  const img = solid(120, 120, WHITE);
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 3; c++) {
      const x = c * 40 + 12 + c * 2;
      const y = r * 60 + 10;
      fillRect(img, x, y, 12, 44, [30, 30, 40, 255]);
      fillRect(img, x + 2, y + 4, 8, 10, [200, 60, 60, 255]);
    }
  return img;
}

describe("gridCells", () => {
  it("covers the sheet row-major with margins and gaps", () => {
    const cells = gridCells(120, 120, { rows: 2, cols: 3, marginX: 0, marginY: 0, gapX: 0, gapY: 0 });
    expect(cells).toHaveLength(6);
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 40, h: 60 });
    expect(cells[5]).toEqual({ x: 80, y: 60, w: 40, h: 60 });
    const g = gridCells(100, 50, { rows: 1, cols: 2, marginX: 5, marginY: 5, gapX: 10, gapY: 0 });
    expect(g).toEqual([{ x: 5, y: 5, w: 40, h: 40 }, { x: 55, y: 5, w: 40, h: 40 }]);
    expect(gridCells(10, 10, { rows: 20, cols: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 })).toEqual([]);
  });
});

describe("detectSprites", () => {
  it("finds each figure, trimmed, in row-major order", () => {
    const rects = detectSprites(sheet(), { cleanup: DEFAULT_CLEANUP, minGap: 3, minSize: 4 });
    expect(rects).toHaveLength(6);
    expect(rects[0]).toEqual({ x: 12, y: 10, w: 12, h: 44 });
    expect(rects[3].y).toBe(70);
    expect(groupRows(rects)).toEqual([[0, 1, 2], [3, 4, 5]]);
  });
});

describe("buildAnimationFrames", () => {
  const base = { preset, cleanup: DEFAULT_CLEANUP, maxColors: 8, alphaThreshold: 128, resizeMethod: "box" as const };
  const lowest = (f: string[]) => f.reduce((m, p, i) => (p ? Math.max(m, Math.floor(i / 128)) : m), -1);

  it("cell mode keeps the artist's motion, feet on the anchor, one palette", () => {
    const cells = cropCells(sheet(), gridCells(120, 120, { rows: 1, cols: 3, marginX: 0, marginY: 0, gapX: 0, gapY: 0 }).map((r) => ({ ...r, h: 60 })));
    const r = buildAnimationFrames(cells, { ...base, align: "cell" });
    expect(r.frames).toHaveLength(3);
    for (const f of r.frames) {
      expect(f).toHaveLength(128 * 192);
      expect(lowest(f)).toBe(preset.footAnchor.y);
    }
    const leftmost = (f: string[]) => f.reduce((m, p, i) => (p ? Math.min(m, i % 128) : m), 999);
    expect(leftmost(r.frames[1])).toBeGreaterThan(leftmost(r.frames[0])); // moved right like in the sheet
    expect(r.palette.length).toBeLessThanOrEqual(8);
  });

  it("foot mode aligns trimmed frames on the anchor and reports empty cells", () => {
    const img = sheet();
    const rects = detectSprites(img, { cleanup: DEFAULT_CLEANUP, minGap: 3, minSize: 4 });
    const cells = [...cropCells(img, rects.slice(0, 2)), solid(10, 10, WHITE)];
    const r = buildAnimationFrames(cells, { ...base, align: "foot" });
    expect(lowest(r.frames[0])).toBe(preset.footAnchor.y);
    expect(lowest(r.frames[1])).toBe(preset.footAnchor.y);
    expect(r.frames[2].every((p) => !p)).toBe(true);
    expect(r.warnings.some((w) => w.includes("trống"))).toBe(true);
  });
});
