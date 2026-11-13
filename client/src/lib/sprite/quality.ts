import type { QualityIssue, SpritePreset } from "@/types/sprite";

export interface PixelImage {
  width: number;
  height: number;
  pixels: string[];
}

export interface QualityReport {
  issues: QualityIssue[];
  stats: {
    colors: number;
    opaque: number;
    bbox: { x: number; y: number; w: number; h: number } | null;
    foot: { x: number; y: number } | null;
    components: number;
    strayPixels: number;
    /** silhouette overlap with master (intersection / union), 0..1 */
    masterIoU?: number;
  };
}

/** FNV-1a hash of the pixel data (used to detect edits after approval). */
export function hashPixels(pixels: string[]): string {
  let h = 0x811c9dc5;
  for (const p of pixels) {
    const s = p || "-";
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function bboxOf(img: PixelImage) {
  let minX = img.width,
    minY = img.height,
    maxX = -1,
    maxY = -1;
  for (let i = 0; i < img.pixels.length; i++) {
    if (!img.pixels[i]) continue;
    const x = i % img.width;
    const y = (i - x) / img.width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Feet on the pixel canvas: lowest opaque row, x = centre of the opaque pixels in the bottom 3 rows. */
export function footOf(img: PixelImage): { x: number; y: number } | null {
  const b = bboxOf(img);
  if (!b) return null;
  const band = Math.max(1, Math.min(3, b.h));
  let sum = 0,
    n = 0;
  for (let y = b.y + b.h - band; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++)
      if (img.pixels[y * img.width + x]) {
        sum += x;
        n++;
      }
  return { x: Math.round(sum / n), y: b.y + b.h - 1 };
}

/** 8-connected components of opaque pixels, sizes sorted descending. */
export function components(img: PixelImage): number[] {
  const { width: w, height: h, pixels } = img;
  const seen = new Uint8Array(w * h);
  const sizes: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || !pixels[s]) continue;
    let n = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!seen[j] && pixels[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
}

export function silhouetteIoU(a: PixelImage, b: PixelImage): number {
  if (a.width !== b.width || a.height !== b.height) return 0;
  let inter = 0,
    uni = 0;
  for (let i = 0; i < a.pixels.length; i++) {
    const pa = !!a.pixels[i],
      pb = !!b.pixels[i];
    if (pa && pb) inter++;
    if (pa || pb) uni++;
  }
  return uni ? inter / uni : 1;
}

/**
 * Automatic checks. They only *report* - nothing here modifies the image.
 */
export function runQualityChecks(
  img: PixelImage,
  preset: SpritePreset,
  opts?: { master?: PixelImage | null; lockedPalette?: string[] | null; paletteStrict?: boolean },
): QualityReport {
  const issues: QualityIssue[] = [];
  const push = (id: string, level: QualityIssue["level"], message: string) => issues.push({ id, level, message });
  const { width: W, height: H, pixels } = img;

  if (W !== preset.canvas.width || H !== preset.canvas.height)
    push("canvas", "error", `Canvas ${W}×${H} khác preset ${preset.canvas.width}×${preset.canvas.height}.`);

  const opaque = pixels.filter(Boolean).length;
  const colors = new Set(pixels.filter(Boolean));
  const bbox = bboxOf(img);
  const foot = footOf(img);
  const comps = components(img);
  const stray = comps.slice(1).filter((n) => n <= preset.checks.maxStrayClusterSize);
  const strayPixels = stray.reduce((a, b) => a + b, 0);

  if (!opaque) push("empty", "error", "Sprite trống (không có pixel nào).");
  else {
    const corners = [0, W - 1, (H - 1) * W, H * W - 1].filter((i) => !!pixels[i]).length;
    if (corners >= 2) push("alpha-bg", "warn", "Các góc canvas có pixel - có thể còn sót nền chưa xóa.");
    if (opaque / (W * H) > 0.85) push("alpha-full", "warn", "Hơn 85% canvas đặc - nền có thể chưa trong suốt.");
  }

  if (colors.size > preset.maxColors) push("colors", "warn", `${colors.size} màu, vượt giới hạn preset (${preset.maxColors}).`);
  if (opts?.lockedPalette?.length) {
    const allowed = new Set(opts.lockedPalette.map((c) => c.toLowerCase()));
    const outside = [...colors].filter((c) => !allowed.has(c.toLowerCase()));
    if (outside.length) {
      if (opts.paletteStrict === false) push("palette", "info", `${outside.length} màu mới so với master (trang phục mới) - ${colors.size - outside.length} màu dùng chung.`);
      else push("palette", "warn", `${outside.length} màu nằm ngoài palette đã khóa của master.`);
    }
  }

  if (stray.length) push("stray", "warn", `${stray.length} cụm pixel lẻ (≤${preset.checks.maxStrayClusterSize}px, tổng ${strayPixels}px) tách khỏi thân chính.`);
  const bigParts = comps.slice(1).filter((n) => n > preset.checks.maxStrayClusterSize).length;
  if (bigParts) push("parts", "info", `${bigParts} mảng tách rời lớn (vũ khí/phụ kiện?) - kiểm tra bằng mắt.`);

  if (bbox) {
    const m = preset.checks.edgeMarginPx;
    if (bbox.x < m || bbox.y < m || bbox.x + bbox.w > W - m || bbox.y + bbox.h > H - m)
      push("edge", "warn", `Nhân vật chạm/tràn mép canvas (bbox ${bbox.x},${bbox.y} ${bbox.w}×${bbox.h}).`);
  }
  if (foot) {
    const dx = foot.x - preset.footAnchor.x;
    const dy = foot.y - preset.footAnchor.y;
    const max = preset.checks.maxAnchorOffsetPx;
    if (Math.abs(dy) > max) push("anchor-y", "warn", `Chân lệch ${dy > 0 ? "xuống" : "lên"} ${Math.abs(dy)}px so với foot anchor (y=${preset.footAnchor.y}).`);
    if (Math.abs(dx) > max) push("anchor-x", "warn", `Chân lệch ngang ${dx}px so với foot anchor (x=${preset.footAnchor.x}).`);
  }

  let masterIoU: number | undefined;
  if (opts?.master && opts.master.pixels.length) {
    const mf = footOf(opts.master);
    const mb = bboxOf(opts.master);
    if (mf && foot && (Math.abs(mf.x - foot.x) > preset.checks.maxAnchorOffsetPx || Math.abs(mf.y - foot.y) > preset.checks.maxAnchorOffsetPx))
      push("master-anchor", "warn", `Vị trí chân lệch so với master (Δx=${foot.x - mf.x}, Δy=${foot.y - mf.y}).`);
    if (mb && bbox) {
      const dh = (bbox.h - mb.h) / mb.h;
      if (Math.abs(dh) > 0.08) push("master-height", "warn", `Chiều cao khác master ${Math.round(dh * 100)}% (${bbox.h}px vs ${mb.h}px).`);
    }
    masterIoU = silhouetteIoU(img, opts.master);
    push("master-iou", masterIoU < 0.7 ? "warn" : "info", `Silhouette trùng master ${Math.round(masterIoU * 100)}% - khác biệt về hình dáng cần người duyệt.`);
  }

  return { issues, stats: { colors: colors.size, opaque, bbox, foot, components: comps.length, strayPixels, masterIoU } };
}
