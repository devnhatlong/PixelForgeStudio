import { hexToRgb } from "@/lib/color";
import type { CharacterDna, DnaComparison } from "@/types/sprite";
import { footOf, silhouetteIoU, type PixelImage } from "./quality";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function bbox(img: PixelImage): Box | null {
  let minX = img.width,
    minY = img.height,
    maxX = -1,
    maxY = -1;
  for (let i = 0; i < img.pixels.length; i++) {
    if (!img.pixels[i]) continue;
    const x = i % img.width,
      y = (i - x) / img.width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Head region = top third of the body (chibi preset: head ≈ 1/3 of the height). */
function headRows(b: Box, ratio = 1 / 3): [number, number] {
  return [b.y, b.y + Math.max(1, Math.round(b.h * ratio)) - 1];
}

function colorCounts(img: PixelImage, rows?: [number, number]): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < img.pixels.length; i++) {
    const p = img.pixels[i];
    if (!p) continue;
    const y = Math.floor(i / img.width);
    if (rows && (y < rows[0] || y > rows[1])) continue;
    m.set(p, (m.get(p) ?? 0) + 1);
  }
  return m;
}

const dist = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** DNA numbers derived from an approved master (traits text is written by the user / AI). */
export function deriveDna(master: PixelImage, traits = "", notes = ""): CharacterDna {
  const b = bbox(master);
  const head = b ? colorCounts(master, headRows(b)) : new Map<string, number>();
  const keyColors = [...head.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, z) => z[1] - a[1])
    .slice(0, 12)
    .map(([c]) => c);
  return { traits, notes, keyColors, bodyWidth: b?.w ?? 0, bodyHeight: b?.h ?? 0, updatedAt: Date.now() };
}

/**
 * Compare a sprite with its master. Heuristic similarity for warnings — it cannot prove the face/hair are identical.
 */
export function compareToMaster(img: PixelImage, master: PixelImage, dna?: CharacterDna | null): DnaComparison {
  const mb = bbox(master);
  const vb = bbox(img);
  if (!mb || !vb || img.width !== master.width || img.height !== master.height) {
    return { score: 0, silhouetteIoU: 0, headIoU: 0, heightDiffPct: 100, widthDiffPct: 100, footDelta: { dx: 0, dy: 0 }, keyColorsKept: 0, headColorDistance: 441, verdict: "drift" };
  }
  const sil = silhouetteIoU(img, master);
  const [h0, h1] = headRows(mb);
  let inter = 0,
    uni = 0;
  for (let y = h0; y <= h1; y++)
    for (let x = 0; x < img.width; x++) {
      const i = y * img.width + x;
      const a = !!img.pixels[i],
        b = !!master.pixels[i];
      if (a && b) inter++;
      if (a || b) uni++;
    }
  const headIoU = uni ? inter / uni : 1;

  const masterHead = [...colorCounts(master, [h0, h1]).keys()].map(hexToRgb);
  let sum = 0,
    n = 0;
  for (let y = h0; y <= h1; y++)
    for (let x = 0; x < img.width; x++) {
      const p = img.pixels[y * img.width + x];
      if (!p || !masterHead.length) continue;
      const c = hexToRgb(p);
      let best = Infinity;
      for (const m of masterHead) best = Math.min(best, dist(c, m));
      sum += best;
      n++;
    }
  const headColorDistance = n ? sum / n : 441;

  const keys = (dna?.keyColors?.length ? dna.keyColors : deriveDna(master).keyColors).map(hexToRgb);
  const present = [...colorCounts(img).keys()].map(hexToRgb);
  const kept = keys.filter((k) => present.some((p) => dist(k, p) <= 20)).length;
  const keyColorsKept = keys.length ? kept / keys.length : 1;

  const heightDiffPct = ((vb.h - mb.h) / mb.h) * 100;
  const widthDiffPct = ((vb.w - mb.w) / mb.w) * 100;
  const mf = footOf(master)!;
  const vf = footOf(img)!;
  const footDelta = { dx: vf.x - mf.x, dy: vf.y - mf.y };

  let score = 100 * (0.25 * sil + 0.35 * headIoU + 0.25 * Math.max(0, 1 - headColorDistance / 80) + 0.15 * keyColorsKept);
  score -= Math.max(0, Math.abs(heightDiffPct) - 5) * 0.8;
  score -= Math.max(0, Math.abs(footDelta.dy) - 1) * 2 + Math.max(0, Math.abs(footDelta.dx) - 2);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = score >= 80 ? "match" : score >= 60 ? "check" : "drift";
  return { score, silhouetteIoU: sil, headIoU, heightDiffPct, widthDiffPct, footDelta, keyColorsKept, headColorDistance, verdict };
}

/** Text appended to prompts so every generation carries the same identity. */
export function dnaPrompt(dna: CharacterDna | null | undefined): string {
  if (!dna?.traits?.trim()) return "";
  return `\nCharacter DNA (identity that must stay EXACTLY the same — do not change): ${dna.traits.trim()}`;
}
