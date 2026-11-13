import { describe, expect, it } from "vitest";
import { pixelizeRgba } from "@/lib/png-to-pixel";
import { DEFAULT_CLEANUP, detectBackground, removeBackground } from "@/lib/sprite/background";
import { alphaBBox, computeLayout, findFoot, placePixels } from "@/lib/sprite/normalize";
import { runSpritePipeline } from "@/lib/sprite/pipeline";
import { getPreset, validatePreset, withCanvas, SPRITE_PRESETS } from "@/lib/sprite/presets";
import type { PixelConfig } from "@/types/sprite";
import { WHITE, fakeCharacter, fillRect, px, solid } from "./helpers";

const preset = getPreset("HY_CHARACTER_V1")!;
const pixelCfg: PixelConfig = { maxColors: 28, paletteMode: "auto", palette: null, alphaThreshold: 128, resizeMethod: "box" };

describe("presets", () => {
  it("ship valid presets loaded from the config file", () => {
    expect(preset).toBeDefined();
    expect(preset.canvas).toEqual({ width: 128, height: 192 });
    for (const p of SPRITE_PRESETS) expect(validatePreset(p)).toEqual([]);
  });
  it("withCanvas rescales anchor and content height", () => {
    const p = withCanvas(preset, 64, 96);
    expect(p.footAnchor).toEqual({ x: 32, y: 87 });
    expect(p.contentHeight).toBe(60);
    expect(validatePreset(p)).toEqual([]);
  });
});

describe("pixelizeRgba (existing PNG to Pixel engine, now DOM-free)", () => {
  it("box filter averages a 2×2 block, nearest keeps hard edges", () => {
    const img = solid(2, 2, [0, 0, 0, 255]);
    fillRect(img, 0, 0, 1, 1, [255, 255, 255, 255]);
    expect(pixelizeRgba(img, { width: 1, height: 1, maxColors: 4, alphaThreshold: 128 }).pixels).toEqual(["#404040"]);
    expect(pixelizeRgba(img, { width: 1, height: 1, maxColors: 4, alphaThreshold: 128, resizeMethod: "nearest" }).pixels).toEqual(["#000000"]);
  });
  it("respects maxColors and alpha threshold", () => {
    const img = solid(8, 1, [0, 0, 0, 255]);
    for (let x = 0; x < 8; x++) img.data.set([x * 30, 0, 0, x === 7 ? 10 : 255], x * 4);
    const r = pixelizeRgba(img, { width: 8, height: 1, maxColors: 3, alphaThreshold: 128 });
    expect(r.pixels[7]).toBe("");
    expect(new Set(r.pixels.filter(Boolean)).size).toBeLessThanOrEqual(3);
  });
  it("snaps to a fixed palette", () => {
    const r = pixelizeRgba(solid(2, 2, [250, 10, 10, 255]), { width: 2, height: 2, maxColors: 8, alphaThreshold: 128, palette: ["#ff0000", "#0000ff"] });
    expect(r.pixels).toEqual(["#ff0000", "#ff0000", "#ff0000", "#ff0000"]);
  });
});

describe("background cleanup", () => {
  it("detects a white background and an already-transparent one", () => {
    expect(detectBackground(fakeCharacter())).toMatchObject({ alreadyTransparent: false, color: "#ffffff" });
    expect(detectBackground(solid(10, 10, [0, 0, 0, 0])).alreadyTransparent).toBe(true);
  });
  it("edge mode removes the outside, keeps enclosed white, peels the halo, and never mutates the source", () => {
    const src = fakeCharacter();
    const before = src.data.slice();
    const r = removeBackground(src, DEFAULT_CLEANUP);
    expect(src.data).toEqual(before);
    expect(px(r.image, 0, 0)[3]).toBe(0);
    expect(px(r.image, 59, 100)[3]).toBe(0); // halo pixel
    expect(px(r.image, 60, 100)[3]).toBe(255); // dark outline kept
    expect(px(r.image, 100, 90)).toEqual(WHITE); // enclosed white kept
    expect(r.haloRemoved).toBeGreaterThan(0);
  });
  it("global mode also removes enclosed background-coloured areas", () => {
    const r = removeBackground(fakeCharacter(), { ...DEFAULT_CLEANUP, mode: "global" });
    expect(px(r.image, 100, 90)[3]).toBe(0);
  });
  it("disabled cleanup keeps everything", () => {
    const r = removeBackground(fakeCharacter(), { ...DEFAULT_CLEANUP, enabled: false });
    expect(px(r.image, 0, 0)[3]).toBe(255);
  });
});

describe("normalize", () => {
  it("finds bbox and foot", () => {
    const img = solid(20, 30, [0, 0, 0, 0]);
    fillRect(img, 5, 4, 6, 20, [10, 10, 10, 255]);
    const bb = alphaBBox(img)!;
    expect(bb).toEqual({ x: 5, y: 4, w: 6, h: 20 });
    expect(findFoot(img, bb)).toEqual({ x: 7.5, y: 23 });
  });
  it("places feet on the preset anchor with a uniform scale (no distortion)", () => {
    const l = computeLayout({ x: 0, y: 0, w: 100, h: 240 }, { x: 50, y: 239 }, preset);
    expect(l.scale).toBeCloseTo(0.5);
    expect(l.contentHeight).toBe(preset.contentHeight);
    expect(l.contentWidth).toBe(50);
    expect(l.offsetY + l.contentHeight - 1).toBe(preset.footAnchor.y);
    expect(l.offsetX + 25).toBe(preset.footAnchor.x);
    expect(l.overflow).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });
  it("reports overflow instead of squashing when a variant is wider/taller", () => {
    const l = computeLayout({ x: 0, y: 0, w: 400, h: 240 }, { x: 200, y: 239 }, preset);
    expect(l.overflow.left + l.overflow.right).toBeGreaterThan(0);
    expect(l.contentWidth / l.contentHeight).toBeCloseTo(400 / 240, 1);
  });
  it("placePixels clips outside the canvas", () => {
    expect(placePixels(["#a", "#b", "#c", "#d"], 2, 2, -1, 1, 2, 3)).toEqual(["", "", "#b", "", "#d", ""]);
  });
});

describe("runSpritePipeline", () => {
  it("produces a canvas-sized, transparent-background sprite with feet on the anchor", () => {
    const r = runSpritePipeline(fakeCharacter(), { preset, cleanup: DEFAULT_CLEANUP, pixel: pixelCfg });
    expect(r.pixels).toHaveLength(128 * 192);
    expect(r.pixels[0]).toBe("");
    let lowest = -1;
    r.pixels.forEach((p, i) => p && (lowest = Math.max(lowest, Math.floor(i / 128))));
    expect(lowest).toBe(preset.footAnchor.y);
    expect(r.palette.length).toBeLessThanOrEqual(28);
    expect(r.warnings).toEqual([]);
  });
  it("is deterministic and re-runnable from the same source", () => {
    const src = fakeCharacter();
    const a = runSpritePipeline(src, { preset, cleanup: DEFAULT_CLEANUP, pixel: pixelCfg });
    const b = runSpritePipeline(src, { preset, cleanup: DEFAULT_CLEANUP, pixel: pixelCfg });
    expect(a.pixels).toEqual(b.pixels);
  });
  it("match-master scale keeps body size and warns when heights differ", () => {
    const r = runSpritePipeline(fakeCharacter(), { preset, cleanup: DEFAULT_CLEANUP, pixel: pixelCfg, scaleOverride: 0.3 });
    expect(r.normalize?.scaleMode).toBe("match-master");
    expect(r.warnings.some((w) => w.includes("khác master"))).toBe(true);
  });
  it("warns when everything was removed", () => {
    const r = runSpritePipeline(solid(10, 10, WHITE), { preset, cleanup: DEFAULT_CLEANUP, pixel: pixelCfg });
    expect(r.bbox).toBeNull();
    expect(r.warnings[0]).toContain("trống");
  });
});

describe("master-snap palette", () => {
  it("snaps near colours to the master colour and keeps new outfit colours", async () => {
    const { snapToPalette } = await import("@/lib/sprite/pipeline");
    expect(snapToPalette(["#f0c8a0", "#2060d0", ""], ["#f2c8a0", "#c03030"], 28)).toEqual(["#f2c8a0", "#2060d0", ""]);
  });
});
