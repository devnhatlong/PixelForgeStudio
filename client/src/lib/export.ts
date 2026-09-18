import JSZip from "jszip";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { PixelDocument } from "@/types/editor";
import { renderFrameToCanvas } from "./raster";
import { safeName } from "./pforge";

export type Background = "transparent" | "black" | "white";
export type SheetLayout = "grid" | "horizontal" | "vertical";

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

export async function exportPng(doc: PixelDocument, frameIndex: number, scale: number, bg: Background): Promise<Blob> {
  return canvasToBlob(renderFrameToCanvas(doc, doc.frames[frameIndex], scale, bg));
}

export async function exportFramesZip(doc: PixelDocument, scale: number, bg: Background): Promise<Blob> {
  const zip = new JSZip();
  const meta = {
    name: doc.name,
    width: doc.width * scale,
    height: doc.height * scale,
    scale,
    frameCount: doc.frames.length,
    frames: [] as { file: string; duration: number }[],
    generator: "PixelForge Studio",
  };
  for (let i = 0; i < doc.frames.length; i++) {
    const file = `frame_${String(i + 1).padStart(3, "0")}.png`;
    zip.file(file, await canvasToBlob(renderFrameToCanvas(doc, doc.frames[i], scale, bg)));
    meta.frames.push({ file, duration: doc.frames[i].duration });
  }
  zip.file("animation_meta.json", JSON.stringify(meta, null, 2));
  return zip.generateAsync({ type: "blob" });
}

export async function exportGif(doc: PixelDocument, scale: number, bg: Background, defaultFps: number): Promise<Blob> {
  const gif = GIFEncoder();
  const w = doc.width * scale;
  const h = doc.height * scale;
  const format = bg === "transparent" ? "rgba4444" : "rgb565";
  for (const frame of doc.frames) {
    const canvas = renderFrameToCanvas(doc, frame, scale, bg);
    const ctx = canvas.getContext("2d")!;
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const palette = quantize(rgba, 256, { format, oneBitAlpha: bg === "transparent" });
    const index = applyPalette(rgba, palette, format);
    const transparentIndex = bg === "transparent" ? palette.findIndex((p) => p.length > 3 && p[3] === 0) : -1;
    gif.writeFrame(index, w, h, {
      palette,
      delay: frame.duration || Math.round(1000 / defaultFps),
      transparent: transparentIndex >= 0,
      transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
      dispose: bg === "transparent" ? 2 : 0,
    });
  }
  gif.finish();
  const bytes = gif.bytes();
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "image/gif" });
}

export interface SheetOptions {
  layout: SheetLayout;
  columns: number;
  spacing: number;
  scale: number;
}

export function computeSheetGrid(frameCount: number, opts: SheetOptions) {
  const cols = opts.layout === "horizontal" ? frameCount : opts.layout === "vertical" ? 1 : Math.max(1, Math.min(opts.columns, frameCount));
  const rows = Math.ceil(frameCount / cols);
  return { cols, rows };
}

export async function exportSpriteSheet(doc: PixelDocument, opts: SheetOptions): Promise<{ png: Blob; json: string; canvas: HTMLCanvasElement }> {
  const { cols, rows } = computeSheetGrid(doc.frames.length, opts);
  const fw = doc.width * opts.scale;
  const fh = doc.height * opts.scale;
  const sp = opts.spacing;
  const canvas = document.createElement("canvas");
  canvas.width = cols * fw + (cols - 1) * sp;
  canvas.height = rows * fh + (rows - 1) * sp;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const frames: Record<string, unknown> = {};
  doc.frames.forEach((frame, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * (fw + sp);
    const y = row * (fh + sp);
    ctx.drawImage(renderFrameToCanvas(doc, frame, opts.scale, "transparent"), x, y);
    frames[`${safeName(doc.name)}_${String(i + 1).padStart(3, "0")}`] = {
      frame: { x, y, w: fw, h: fh },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: fw, h: fh },
      sourceSize: { w: fw, h: fh },
      duration: frame.duration,
    };
  });

  const json = JSON.stringify(
    {
      frames,
      meta: {
        app: "PixelForge Studio",
        version: "1.0.0",
        image: `${safeName(doc.name)}.png`,
        format: "RGBA8888",
        size: { w: canvas.width, h: canvas.height },
        scale: String(opts.scale),
        frameWidth: fw,
        frameHeight: fh,
        columns: cols,
        rows,
        spacing: sp,
        frameTags: [{ name: "default", from: 0, to: doc.frames.length - 1, direction: "forward" }],
        layers: doc.layers.map((l) => ({ name: l.name, opacity: Math.round(l.opacity * 255), blendMode: "normal" })),
      },
    },
    null,
    2,
  );
  return { png: await canvasToBlob(canvas), json, canvas };
}
