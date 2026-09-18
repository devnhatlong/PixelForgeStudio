import { hexToRgb } from "./color";
import type { Frame, PixelDocument, Selection } from "@/types/editor";

export type Point = { x: number; y: number };

export function emptyPixels(w: number, h: number): string[] {
  return Array(w * h).fill("");
}

/** Composite visible layers of a frame into RGBA bytes. */
export function compositeFrame(doc: PixelDocument, frame: Frame, opts?: { alpha?: number; onlyLayer?: string }): Uint8ClampedArray<ArrayBuffer> {
  const { width, height } = doc;
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  const cache = new Map<string, [number, number, number]>();
  const rgb = (hex: string) => {
    let v = cache.get(hex);
    if (!v) {
      v = hexToRgb(hex);
      cache.set(hex, v);
    }
    return v;
  };
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    if (opts?.onlyLayer && layer.id !== opts.onlyLayer) continue;
    const pixels = frame.cels[layer.id];
    if (!pixels) continue;
    const la = layer.opacity * (opts?.alpha ?? 1);
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      if (!p) continue;
      const [r, g, b] = rgb(p);
      const o = i * 4;
      const da = out[o + 3] / 255;
      const sa = la;
      const a = sa + da * (1 - sa);
      if (a <= 0) continue;
      out[o] = (r * sa + out[o] * da * (1 - sa)) / a;
      out[o + 1] = (g * sa + out[o + 1] * da * (1 - sa)) / a;
      out[o + 2] = (b * sa + out[o + 2] * da * (1 - sa)) / a;
      out[o + 3] = a * 255;
    }
  }
  return out;
}

/** Render a frame to a canvas at a given scale with optional background. */
export function renderFrameToCanvas(
  doc: PixelDocument,
  frame: Frame,
  scale: number,
  background: "transparent" | "black" | "white" = "transparent",
): HTMLCanvasElement {
  const data = compositeFrame(doc, frame);
  const small = document.createElement("canvas");
  small.width = doc.width;
  small.height = doc.height;
  const sctx = small.getContext("2d")!;
  sctx.putImageData(new ImageData(data, doc.width, doc.height), 0, 0);

  const canvas = document.createElement("canvas");
  canvas.width = doc.width * scale;
  canvas.height = doc.height * scale;
  const ctx = canvas.getContext("2d")!;
  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function bresenham(x0: number, y0: number, x1: number, y1: number): Point[] {
  const pts: Point[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

export function rectOutline(x0: number, y0: number, x1: number, y1: number): Point[] {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const pts: Point[] = [];
  for (let x = minX; x <= maxX; x++) {
    pts.push({ x, y: minY });
    if (maxY !== minY) pts.push({ x, y: maxY });
  }
  for (let y = minY + 1; y < maxY; y++) {
    pts.push({ x: minX, y });
    if (maxX !== minX) pts.push({ x: maxX, y });
  }
  return pts;
}

/** Midpoint ellipse bounded by the rectangle (x0,y0)-(x1,y1). */
export function ellipseOutline(x0: number, y0: number, x1: number, y1: number): Point[] {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const set = new Set<string>();
  const pts: Point[] = [];
  const add = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (!set.has(k)) {
      set.add(k);
      pts.push({ x, y });
    }
  };
  if (w <= 2 || h <= 2) return rectOutline(x0, y0, x1, y1);
  const a = w / 2;
  const b = h / 2;
  const cx = minX + a - 0.5;
  const cy = minY + b - 0.5;
  // sample the ellipse parametrically, dense enough for pixel accuracy
  const steps = Math.max(64, (w + h) * 4);
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = Math.round(cx + (a - 0.5) * Math.cos(t));
    const y = Math.round(cy + (b - 0.5) * Math.sin(t));
    add(x, y);
  }
  return pts;
}

export function floodFill(pixels: string[], w: number, h: number, sx: number, sy: number, mask?: Uint8Array | null): number[] {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return [];
  const target = pixels[sy * w + sx];
  const visited = new Uint8Array(w * h);
  const result: number[] = [];
  const stack = [sy * w + sx];
  while (stack.length) {
    const i = stack.pop()!;
    if (visited[i]) continue;
    visited[i] = 1;
    if (pixels[i] !== target) continue;
    if (mask && !mask[i]) continue;
    result.push(i);
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  return result;
}

export function selectionFromIndices(indices: number[], w: number, h: number): Selection | null {
  if (!indices.length) return null;
  const mask = new Uint8Array(w * h);
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (const i of indices) {
    mask[i] = 1;
    const x = i % w;
    const y = (i - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { mask, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function rectSelection(x0: number, y0: number, x1: number, y1: number, w: number, h: number): Selection | null {
  const minX = Math.max(0, Math.min(x0, x1));
  const maxX = Math.min(w - 1, Math.max(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxY = Math.min(h - 1, Math.max(y0, y1));
  if (minX > maxX || minY > maxY) return null;
  const mask = new Uint8Array(w * h);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) mask[y * w + x] = 1;
  return { mask, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Expand a point by brush size (square brush, anchored top-left for even sizes). */
export function brushPoints(x: number, y: number, size: number): Point[] {
  if (size <= 1) return [{ x, y }];
  const off = Math.floor((size - 1) / 2);
  const pts: Point[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) pts.push({ x: x - off + dx, y: y - off + dy });
  return pts;
}

export function mirrorPoints(pts: Point[], mode: "off" | "horizontal" | "vertical" | "both", w: number, h: number): Point[] {
  if (mode === "off") return pts;
  const out: Point[] = [...pts];
  for (const p of pts) {
    if (mode === "horizontal" || mode === "both") out.push({ x: w - 1 - p.x, y: p.y });
    if (mode === "vertical" || mode === "both") out.push({ x: p.x, y: h - 1 - p.y });
    if (mode === "both") out.push({ x: w - 1 - p.x, y: h - 1 - p.y });
  }
  return out;
}

export function makeThumbnail(doc: PixelDocument, size = 96): string {
  const frame = doc.frames[0];
  if (!frame) return "";
  const scale = Math.max(1, Math.floor(size / Math.max(doc.width, doc.height)));
  const c = renderFrameToCanvas(doc, frame, scale, "transparent");
  return c.toDataURL("image/png");
}
