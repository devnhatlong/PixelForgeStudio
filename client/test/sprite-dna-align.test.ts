import { describe, expect, it } from "vitest";
import { compareToMaster, deriveDna, dnaPrompt } from "@/lib/sprite/dna";
import { footAlignment, footJitter, shiftPixels } from "@/lib/sprite/align";
import type { PixelImage } from "@/lib/sprite/quality";

const W = 64,
  H = 96;
/** simple chibi: head (skin+hair) on top third, body below; feet at y=90 */
function chibi(opts: { hair?: string; robe?: string; dx?: number; dy?: number; headW?: number } = {}): PixelImage {
  const { hair = "#202028", robe = "#aa2222", dx = 0, dy = 0, headW = 20 } = opts;
  const px = Array(W * H).fill("");
  const set = (x: number, y: number, c: string) => {
    const X = x + dx,
      Y = y + dy;
    if (X >= 0 && Y >= 0 && X < W && Y < H) px[Y * W + X] = c;
  };
  for (let y = 31; y <= 50; y++) for (let x = 32 - headW / 2; x < 32 + headW / 2; x++) set(x, y, y < 38 ? hair : "#f0c8a0");
  for (let y = 51; y <= 90; y++) for (let x = 24; x < 40; x++) set(x, y, robe);
  return { width: W, height: H, pixels: px };
}

describe("Character DNA comparison", () => {
  const master = chibi();
  const dna = deriveDna(master, "black topknot hair, amber eyes");

  it("derives key colours from the head and the body size", () => {
    expect(dna.keyColors).toEqual(expect.arrayContaining(["#202028", "#f0c8a0"]));
    expect(dna.bodyHeight).toBe(60);
  });
  it("an outfit-only change keeps a high score; identity drift lowers it", () => {
    const outfit = compareToMaster(chibi({ robe: "#2244aa" }), master, dna);
    expect(outfit.verdict).toBe("match");
    expect(outfit.headIoU).toBe(1);
    const newHair = compareToMaster(chibi({ robe: "#2244aa", hair: "#e0e0e0", headW: 28 }), master, dna);
    expect(newHair.score).toBeLessThan(outfit.score);
    expect(newHair.headColorDistance).toBeGreaterThan(outfit.headColorDistance);
    const shifted = compareToMaster(chibi({ dy: -6 }), master, dna);
    expect(shifted.footDelta.dy).toBe(-6);
    expect(shifted.score).toBeLessThan(outfit.score);
  });
  it("dnaPrompt is empty without traits", () => {
    expect(dnaPrompt(null)).toBe("");
    expect(dnaPrompt(dna)).toContain("black topknot hair");
  });
});

describe("pivot lock", () => {
  it("shiftPixels moves and clips", () => {
    expect(shiftPixels(["a", "b", "c", "d"], 2, 2, 1, 0)).toEqual(["", "a", "", "c"]);
    expect(shiftPixels(["a", "b", "c", "d"], 2, 2, 0, -1)).toEqual(["c", "d", "", ""]);
  });
  it("computes per-frame shifts to the anchor and the jitter", () => {
    const frames = [chibi(), chibi({ dx: 3, dy: -2 }), chibi({ dx: -1 })];
    const info = footAlignment(frames, { x: 32, y: 90 });
    expect(info.map((i) => [i.dx, i.dy])).toEqual([[0, 0], [-3, 2], [1, 0]]);
    expect(footJitter(info)).toEqual({ x: 4, y: 2 });
    expect(footAlignment(frames, { x: 32, y: 90 }, "y").every((i) => i.dx === 0)).toBe(true);
  });
});
