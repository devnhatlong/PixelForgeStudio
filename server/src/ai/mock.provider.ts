import { PNG } from "pngjs";
import { GenerateRequest, ImageProvider, ProviderError, ProviderResult } from "./ai.types";

/**
 * Deterministic offline provider for development and tests. It does NOT use AI:
 * - master: draws a simple chibi swordsman on a white background (exercises background removal),
 * - variant: hue-shifts the reference image inside the mask (exercises the master→variant flow).
 * Same seed → same image.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RGB = [number, number, number];

function hsl(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

class Painter {
  readonly data: Buffer;
  readonly fg: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = Buffer.alloc(w * h * 4, 255);
    this.fg = new Uint8Array(w * h);
  }
  set(x: number, y: number, c: RGB) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.data[i * 4] = c[0];
    this.data[i * 4 + 1] = c[1];
    this.data[i * 4 + 2] = c[2];
    this.data[i * 4 + 3] = 255;
    this.fg[i] = 1;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, c);
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  /** trapezoid: top width tw centred at cx, bottom width bw */
  trap(cx: number, y0: number, y1: number, tw: number, bw: number, c: RGB) {
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      const half = (tw + (bw - tw) * t) / 2;
      for (let x = Math.floor(cx - half); x <= cx + half; x++) this.set(x, y, c);
    }
  }
  outline(c: RGB, thickness: number) {
    for (let pass = 0; pass < thickness; pass++) {
      const add: number[] = [];
      for (let i = 0; i < this.w * this.h; i++) {
        if (this.fg[i]) continue;
        const x = i % this.w,
          y = (i - x) / this.w;
        if ((x > 0 && this.fg[i - 1]) || (x < this.w - 1 && this.fg[i + 1]) || (y > 0 && this.fg[i - this.w]) || (y < this.h - 1 && this.fg[i + this.w])) add.push(i);
      }
      for (const i of add) this.set(i % this.w, Math.floor(i / this.w), c);
    }
  }
  png(): Buffer {
    const png = new PNG({ width: this.w, height: this.h });
    this.data.copy(png.data);
    return PNG.sync.write(png);
  }
}

/** Layout is designed for a 2:3 canvas; height should be width × 1.5. */
export function drawMockCharacter(seed: number, width = 512, height = 768, hue: number | null = null): Buffer {
  const r = rng(seed);
  const p = new Painter(width, height);
  const s = width / 512;
  const cx = width / 2 + (r() - 0.5) * 20 * s;
  const randomHue = Math.floor(r() * 360);
  const robeHue = hue ?? randomHue;
  const robe = hsl(robeHue, 0.55, 0.42);
  const robeDark = hsl(robeHue, 0.55, 0.28);
  const sash = hsl((robeHue + 180) % 360, 0.6, 0.5);
  const skin: RGB = [242, 200, 160];
  const hair: RGB = [38, 30, 40];
  const pants: RGB = [60, 52, 70];
  const steel: RGB = [200, 210, 220];
  const feetY = 700 * s;

  // sword (behind body)
  p.rect(Math.round(cx + 70 * s), Math.round(330 * s), Math.round(10 * s), Math.round(290 * s), steel);
  p.rect(Math.round(cx + 58 * s), Math.round(330 * s), Math.round(34 * s), Math.round(10 * s), sash);
  // legs + shoes
  p.rect(Math.round(cx - 45 * s), Math.round(590 * s), Math.round(38 * s), Math.round(95 * s), pants);
  p.rect(Math.round(cx + 10 * s), Math.round(590 * s), Math.round(38 * s), Math.round(95 * s), pants);
  p.rect(Math.round(cx - 50 * s), Math.round(feetY - 18 * s), Math.round(48 * s), Math.round(18 * s), hair);
  p.rect(Math.round(cx + 8 * s), Math.round(feetY - 18 * s), Math.round(52 * s), Math.round(18 * s), hair);
  // robe + sash + arms
  p.trap(cx, Math.round(320 * s), Math.round(600 * s), 140 * s, 230 * s, robe);
  p.trap(cx, Math.round(520 * s), Math.round(600 * s), 190 * s, 230 * s, robeDark);
  p.rect(Math.round(cx - 75 * s), Math.round(430 * s), Math.round(150 * s), Math.round(22 * s), sash);
  p.ellipse(cx - 85 * s, 420 * s, 26 * s, 75 * s, robeDark);
  p.ellipse(cx + 85 * s, 420 * s, 26 * s, 75 * s, robeDark);
  p.ellipse(cx + 88 * s, 495 * s, 16 * s, 16 * s, skin);
  // head: face, hair, topknot, eyes (3/4 view → features shifted right)
  p.ellipse(cx, 225 * s, 105 * s, 98 * s, hair);
  p.ellipse(cx + 14 * s, 245 * s, 82 * s, 78 * s, skin);
  p.trap(cx, Math.round(130 * s), Math.round(205 * s), 150 * s, 215 * s, hair);
  p.ellipse(cx - 5 * s, 112 * s, 32 * s, 28 * s, hair);
  p.rect(Math.round(cx - 20 * s), Math.round(128 * s), Math.round(32 * s), Math.round(10 * s), sash);
  p.rect(Math.round(cx + 20 * s), Math.round(240 * s), Math.round(12 * s), Math.round(24 * s), hair);
  p.rect(Math.round(cx + 62 * s), Math.round(240 * s), Math.round(10 * s), Math.round(22 * s), hair);
  p.outline([28, 22, 30], Math.max(1, Math.round(4 * s)));
  return p.png();
}

export function recolorVariant(reference: Buffer, mask: Buffer | null, seed: number): Buffer {
  let ref: PNG;
  try {
    ref = PNG.sync.read(reference);
  } catch {
    throw new ProviderError("Mock provider chỉ đọc được ảnh tham chiếu PNG", 400, false);
  }
  let m: PNG | null = null;
  if (mask) {
    try {
      m = PNG.sync.read(mask);
    } catch {
      throw new ProviderError("Mask không phải PNG hợp lệ", 400, false);
    }
    if (m.width !== ref.width || m.height !== ref.height) throw new ProviderError("Mask phải cùng kích thước với ảnh tham chiếu", 400, false);
  }
  const shift = 60 + Math.floor(rng(seed)() * 240);
  const out = new PNG({ width: ref.width, height: ref.height });
  ref.data.copy(out.data);
  for (let i = 0; i < ref.width * ref.height; i++) {
    const o = i * 4;
    if (m && m.data[o] < 128) continue; // black = protected
    const [h, s, l] = toHsl(ref.data[o], ref.data[o + 1], ref.data[o + 2]);
    if (s < 0.2 || l > 0.92 || l < 0.08) continue;
    if (!m && h >= 10 && h <= 45 && l > 0.55) continue; // protect skin when no mask
    const [nr, ng, nb] = hsl((h + shift) % 360, s, l);
    out.data[o] = nr;
    out.data[o + 1] = ng;
    out.data[o + 2] = nb;
  }
  return PNG.sync.write(out);
}

/** Dominant hue (0..359) of saturated, opaque pixels of a PNG; null if not a PNG or no saturated pixels. */
export function dominantHue(png: Buffer): number | null {
  let img: PNG;
  try {
    img = PNG.sync.read(png);
  } catch {
    return null;
  }
  const bins = new Array(36).fill(0);
  const step = Math.max(1, Math.floor((img.width * img.height) / 40000));
  for (let i = 0; i < img.width * img.height; i += step) {
    const o = i * 4;
    if (img.data[o + 3] < 128) continue;
    const [h, s, l] = toHsl(img.data[o], img.data[o + 1], img.data[o + 2]);
    if (s < 0.25 || l < 0.15 || l > 0.85) continue;
    bins[Math.floor(h / 10) % 36]++;
  }
  const max = Math.max(...bins);
  return max > 0 ? bins.indexOf(max) * 10 + 5 : null;
}

/**
 * Mock animation sheet: the reference tiled on a grid (cols×rows from the aspect: 3×2 landscape),
 * each frame bobbing 0..3% of its height so the slicer + animation preview have motion to show.
 */
export function mockSheet(reference: Buffer, aspect: { width: number; height: number }, seed: number): Buffer {
  let ref: PNG;
  try {
    ref = PNG.sync.read(reference);
  } catch {
    throw new ProviderError("Mock provider chỉ đọc được ảnh tham chiếu PNG", 400, false);
  }
  const cols = aspect.width >= aspect.height ? 3 : 2;
  const rows = aspect.width >= aspect.height ? 2 : 3;
  const cellW = 256,
    cellH = Math.round((cellW * ref.height) / ref.width);
  const out = new PNG({ width: cols * cellW, height: rows * cellH });
  out.data.fill(255);
  const sx = ref.width / (cellW * 0.8);
  for (let f = 0; f < cols * rows; f++) {
    const ox = (f % cols) * cellW + Math.round(cellW * 0.1);
    const bob = Math.round(Math.abs(Math.sin((f + seed) * 0.9)) * cellH * 0.03);
    const oy = Math.floor(f / cols) * cellH + Math.round(cellH * 0.08) - bob;
    for (let y = 0; y < Math.round(cellH * 0.86); y++)
      for (let x = 0; x < Math.round(cellW * 0.8); x++) {
        const rx = Math.min(ref.width - 1, Math.floor(x * sx)),
          ry = Math.min(ref.height - 1, Math.floor(y * sx));
        const si = (ry * ref.width + rx) * 4;
        const tx = ox + x,
          ty = oy + y;
        if (tx < 0 || ty < 0 || tx >= out.width || ty >= out.height) continue;
        const di = (ty * out.width + tx) * 4;
        out.data[di] = ref.data[si];
        out.data[di + 1] = ref.data[si + 1];
        out.data[di + 2] = ref.data[si + 2];
        out.data[di + 3] = 255;
      }
  }
  return PNG.sync.write(out);
}

export class MockProvider implements ImageProvider {
  readonly id = "mock";
  readonly model = "mock-procedural-v1";
  readonly capabilities = { reference: true, styleReference: true, mask: true, seed: true, maxCount: 4 };

  isConfigured() {
    return true;
  }

  async generate(req: GenerateRequest): Promise<ProviderResult> {
    // stand-in for "follow the style": take the dominant saturated hue of the first PNG style example
    const styleHue = req.styleRefs?.length ? dominantHue(req.styleRefs[0].buffer) : null;
    const base = req.seed ?? Math.floor(Math.random() * 1e9);
    const images = [];
    for (let k = 0; k < req.count; k++) {
      const seed = base + k;
      const buffer =
        req.mode === "animation" && req.reference
          ? mockSheet(req.reference.buffer, req.aspect, seed)
          : req.mode === "variant" && req.reference
          ? recolorVariant(req.reference.buffer, req.mask?.buffer ?? null, seed)
          : drawMockCharacter(seed, 512, 768, styleHue);
      images.push({ buffer, mime: "image/png", seed });
    }
    return {
      images,
      model: this.model,
      params: { seed: base, styleHue },
      warnings: ["Đây là MOCK provider (không phải AI): ảnh chỉ để thử quy trình."],
    };
  }
}
