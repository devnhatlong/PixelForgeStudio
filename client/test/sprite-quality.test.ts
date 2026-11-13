import { describe, expect, it } from "vitest";
import { components, footOf, hashPixels, runQualityChecks, silhouetteIoU, type PixelImage } from "@/lib/sprite/quality";
import { buildManifest, flattenFrame, isEditedAfterApproval, sanitizeId, toSpriteSummary, withStatus } from "@/lib/sprite/meta";
import { getPreset } from "@/lib/sprite/presets";
import type { PixelDocument } from "@/types/editor";
import type { SpriteMeta } from "@/types/sprite";

const preset = getPreset("HY_CHARACTER_V1")!;
const W = 128,
  H = 192;

function body(x0 = 54, top = 55, w = 20, foot = preset.footAnchor.y, color = "#aa2222"): PixelImage {
  const pixels = Array(W * H).fill("");
  for (let y = top; y <= foot; y++) for (let x = x0; x < x0 + w; x++) pixels[y * W + x] = color;
  return { width: W, height: H, pixels };
}

function doc(img: PixelImage, sprite?: Partial<SpriteMeta>): PixelDocument {
  return {
    id: "d1",
    name: "Kiếm khách",
    width: img.width,
    height: img.height,
    layers: [{ id: "l1", name: "L", visible: true, locked: false, opacity: 1 }],
    frames: [{ id: "f1", duration: 100, cels: { l1: img.pixels.slice() } }],
    palette: [],
    createdAt: 0,
    updatedAt: 0,
    sprite: sprite
      ? ({
          kind: "master",
          characterId: "HY_MALE_SWORD_001",
          masterId: null,
          outfit: "BASE",
          presetId: preset.id,
          presetVersion: preset.version,
          preset,
          view: "right_3quarter",
          pose: "neutral_idle",
          footAnchor: preset.footAnchor,
          paletteId: null,
          status: "draft",
          sourceAssetId: "src_1",
          generation: null,
          version: 1,
          history: [],
          ...sprite,
        } as SpriteMeta)
      : undefined,
  };
}

describe("quality checks", () => {
  it("a clean sprite on the anchor has no warnings", () => {
    const r = runQualityChecks(body(), preset);
    expect(r.issues.filter((i) => i.level !== "info")).toEqual([]);
    expect(r.stats.foot).toEqual({ x: 64, y: preset.footAnchor.y });
  });
  it("flags wrong canvas, colour count, stray pixels, edge overflow and anchor offset", () => {
    const img = body(0, 0, 20, H - 1);
    img.pixels[5 * W + 100] = "#00ff00"; // stray pixel
    for (let i = 0; i < 40; i++) img.pixels[10 * W + 30 + i] = `#0000${(i + 16).toString(16).padStart(2, "0")}`;
    const ids = runQualityChecks(img, preset).issues.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["colors", "stray", "edge", "anchor-y", "anchor-x"]));
    const small = runQualityChecks({ width: 10, height: 10, pixels: Array(100).fill("") }, preset).issues.map((i) => i.id);
    expect(small).toEqual(expect.arrayContaining(["canvas", "empty"]));
  });
  it("flags a background that was not removed", () => {
    const full = { width: W, height: H, pixels: Array(W * H).fill("#ffffff") };
    const ids = runQualityChecks(full, preset).issues.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["alpha-bg", "alpha-full"]));
  });
  it("compares a variant against the master (anchor, height, silhouette, locked palette)", () => {
    const master = body();
    const variant = body(58, 40, 20, preset.footAnchor.y - 4, "#2222aa");
    const r = runQualityChecks(variant, preset, { master, lockedPalette: ["#aa2222"] });
    const ids = r.issues.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["master-anchor", "master-height", "master-iou", "palette"]));
    expect(r.stats.masterIoU).toBeGreaterThan(0);
    expect(r.stats.masterIoU).toBeLessThan(1);
  });
  it("helpers", () => {
    expect(components(body())).toEqual([20 * (preset.footAnchor.y - 55 + 1)]);
    expect(silhouetteIoU(body(), body())).toBe(1);
    expect(footOf({ width: 2, height: 2, pixels: ["", "", "", ""] })).toBeNull();
    expect(hashPixels(["#a", ""])).not.toBe(hashPixels(["", "#a"]));
  });
});

describe("sprite meta / approval / manifest", () => {
  it("approval records a hash and locks the master palette; edits are detected", () => {
    const d = withStatus(doc(body(), {}), "approved");
    expect(d.sprite?.status).toBe("approved");
    expect(d.sprite?.lockedPalette).toEqual(["#aa2222"]);
    expect(isEditedAfterApproval(d)).toBe(false);
    const edited = { ...d, frames: [{ ...d.frames[0], cels: { l1: d.frames[0].cels.l1.map((p, i) => (i === 0 ? "#000000" : p)) } }] };
    expect(isEditedAfterApproval(edited)).toBe(true);
    expect(toSpriteSummary(edited)?.editedAfterApproval).toBe(true);
    expect(withStatus(edited, "draft").sprite?.approvedHash).toBeNull();
    expect(d.sprite?.history.at(-1)?.action).toBe("status:approved");
  });
  it("flattenFrame ignores hidden layers", () => {
    const d = doc(body());
    d.layers.push({ id: "l2", name: "hidden", visible: false, locked: false, opacity: 1 });
    d.frames[0].cels.l2 = Array(W * H).fill("#ffffff");
    expect(flattenFrame(d).pixels[0]).toBe("");
  });
  it("manifest follows the spec schema and maps the foot anchor to a Unity pivot", () => {
    const m = buildManifest(doc(body(), { kind: "variant", masterId: "m1", outfit: "Outfit A" }), { file: "x.png", masterAssetId: "HY_MALE_SWORD_001_BASE" });
    expect(m).toMatchObject({
      id: "HY_MALE_SWORD_001_OUTFIT_A",
      masterId: "m1",
      masterAssetId: "HY_MALE_SWORD_001_BASE",
      presetId: "HY_CHARACTER_V1",
      presetVersion: 1,
      canvas: { width: 128, height: 192 },
      view: "right_3quarter",
      pose: "neutral_idle",
      footAnchor: { x: 64, y: 174 },
      status: "draft",
      sourceAssetId: "src_1",
      file: "x.png",
    });
    expect(m.unityPivot).toEqual({ x: 0.5, y: +((192 - 1 - 174) / 192).toFixed(5) });
  });
  it("sanitizeId handles Vietnamese", () => {
    expect(sanitizeId("Nam Kiếm Khách đỏ")).toBe("NAM_KIEM_KHACH_DO");
  });
});
