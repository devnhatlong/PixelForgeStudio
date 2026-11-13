import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { sniffMime, validateGenerate } from "../src/ai/validation";
import { MockProvider, drawMockCharacter, recolorVariant } from "../src/ai/mock.provider";
import { toOpenAiMask } from "../src/ai/openai.provider";
import { spriteSummary } from "../src/projects/sprite-summary";

const png = (w = 4, h = 4, fill: [number, number, number, number] = [255, 255, 255, 255]) => {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) p.data.set(fill, i * 4);
  return PNG.sync.write(p);
};
const file = (buffer: Buffer, mimetype = "image/png") => ({ buffer, mimetype, size: buffer.length });
const limits = { maxCount: 4, maxBytes: 1024 * 1024 };

describe("validateGenerate", () => {
  it("accepts a minimal master request", () => {
    const r = validateGenerate({ prompt: "kiếm khách", count: "2" }, {}, limits);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ mode: "master", count: 2, aspect: { width: 128, height: 192 }, seed: null });
  });
  it("requires a reference for variants", () => {
    const r = validateGenerate({ mode: "variant", prompt: "outfit A" }, {}, limits);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("tham chiếu") });
  });
  it("rejects too many candidates and short prompts", () => {
    expect(validateGenerate({ prompt: "abc", count: 9 }, {}, limits).ok).toBe(false);
    expect(validateGenerate({ prompt: "a" }, {}, limits).ok).toBe(false);
  });
  it("rejects a file whose bytes do not match its declared MIME", () => {
    const fake = file(Buffer.from("GIF89a....."), "image/png");
    const r = validateGenerate({ mode: "variant", prompt: "outfit" }, { reference: fake }, limits);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("định dạng") });
  });
  it("rejects oversize files", () => {
    const big = file(Buffer.concat([png(), Buffer.alloc(2 * 1024 * 1024)]));
    const r = validateGenerate({ mode: "variant", prompt: "outfit" }, { reference: big }, limits);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("dung lượng") });
  });
  it("rejects a mask without a reference", () => {
    expect(validateGenerate({ prompt: "outfit" }, { mask: file(png()) }, limits).ok).toBe(false);
  });
});

describe("sniffMime", () => {
  it("detects png/jpeg/webp", () => {
    expect(sniffMime(png())).toBe("image/png");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffMime(Buffer.from("hello"))).toBeNull();
  });
});

describe("MockProvider", () => {
  it("is deterministic for the same seed", async () => {
    expect(drawMockCharacter(7).equals(drawMockCharacter(7))).toBe(true);
    expect(drawMockCharacter(7).equals(drawMockCharacter(8))).toBe(false);
  });
  it("draws a character on a white background (corners white, centre not)", () => {
    const img = PNG.sync.read(drawMockCharacter(1));
    expect([...img.data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    const c = ((400 * img.width) + 256) * 4;
    expect(img.data[c] + img.data[c + 1] + img.data[c + 2]).toBeLessThan(700);
  });
  it("returns `count` candidates with consecutive seeds", async () => {
    const r = await new MockProvider().generate({ mode: "master", prompt: "x", count: 3, aspect: { width: 128, height: 192 }, seed: 10 });
    expect(r.images.map((i) => i.seed)).toEqual([10, 11, 12]);
  });
  it("variant only changes pixels inside the mask", () => {
    const ref = new PNG({ width: 2, height: 1 });
    ref.data.set([200, 40, 40, 255, 200, 40, 40, 255]);
    const mask = new PNG({ width: 2, height: 1 });
    mask.data.set([255, 255, 255, 255, 0, 0, 0, 255]);
    const out = PNG.sync.read(recolorVariant(PNG.sync.write(ref), PNG.sync.write(mask), 3));
    expect([...out.data.subarray(0, 3)]).not.toEqual([200, 40, 40]);
    expect([...out.data.subarray(4, 7)]).toEqual([200, 40, 40]);
  });
});

describe("toOpenAiMask", () => {
  it("white (editable) becomes alpha 0, black stays opaque", () => {
    const m = new PNG({ width: 2, height: 1 });
    m.data.set([255, 255, 255, 255, 0, 0, 0, 255]);
    const out = PNG.sync.read(toOpenAiMask(PNG.sync.write(m)));
    expect(out.data[3]).toBe(0);
    expect(out.data[7]).toBe(255);
  });
});

describe("spriteSummary", () => {
  it("extracts list fields and ignores ordinary projects", () => {
    expect(spriteSummary({})).toBeNull();
    expect(spriteSummary({ sprite: { kind: "variant", characterId: "HY_A", masterId: "d1", outfit: "A", status: "approved", version: 2, presetId: "P" } })).toEqual({
      kind: "variant",
      characterId: "HY_A",
      masterId: "d1",
      outfit: "A",
      status: "approved",
      version: 2,
      presetId: "P",
    });
    expect(spriteSummary({ sprite: { status: "hacked" } })?.status).toBe("draft");
  });
});

describe("style references", () => {
  it("validation accepts up to 3 style images and rejects more / fake ones", () => {
    const s = file(png());
    expect(validateGenerate({ prompt: "new hero" }, { style: [s, s, s] }, limits).ok).toBe(true);
    expect(validateGenerate({ prompt: "new hero" }, { style: [s, s, s, s] }, limits).ok).toBe(false);
    expect(validateGenerate({ prompt: "new hero" }, { style: [file(Buffer.from("nope"), "image/png")] }, limits).ok).toBe(false);
  });
  it("mock master follows the style image's dominant hue", async () => {
    const blue = png(16, 16, [30, 80, 220, 255]);
    const r = await new MockProvider().generate({ mode: "master", prompt: "x", count: 1, aspect: { width: 128, height: 192 }, seed: 1, styleRefs: [{ buffer: blue, mime: "image/png" }] });
    expect(r.params.styleHue).toBeGreaterThan(200);
    expect(r.params.styleHue).toBeLessThan(250);
  });
});

describe("per-request model / quality", () => {
  it("accepts valid overrides and rejects bad ones", () => {
    const ok = validateGenerate({ prompt: "hero", model: "gpt-image-2.5-flare", quality: "low" }, {}, limits);
    expect(ok.ok && ok.value.model === "gpt-image-2.5-flare" && ok.value.quality === "low").toBe(true);
    const def = validateGenerate({ prompt: "hero" }, {}, limits);
    expect(def.ok && def.value.model === null && def.value.quality === null).toBe(true);
    expect(validateGenerate({ prompt: "hero", model: "../x y" }, {}, limits).ok).toBe(false);
    expect(validateGenerate({ prompt: "hero", quality: "ultra" }, {}, limits).ok).toBe(false);
  });
});

describe("animation mode", () => {
  it("requires a reference and refuses a mask", () => {
    expect(validateGenerate({ mode: "animation", prompt: "idle sheet" }, {}, limits).ok).toBe(false);
    const ref = file(png());
    expect(validateGenerate({ mode: "animation", prompt: "idle sheet" }, { reference: ref }, limits).ok).toBe(true);
    expect(validateGenerate({ mode: "animation", prompt: "idle sheet" }, { reference: ref, mask: ref }, limits).ok).toBe(false);
  });
  it("mock returns a 3×2 sheet built from the reference", async () => {
    const r = await new MockProvider().generate({ mode: "animation", prompt: "x", count: 1, aspect: { width: 1536, height: 1024 }, seed: 1, reference: { buffer: drawMockCharacter(3), mime: "image/png" } });
    const sheet = PNG.sync.read(r.images[0].buffer);
    expect(sheet.width).toBe(768);
    expect(sheet.height).toBe(2 * 384);
  });
});
