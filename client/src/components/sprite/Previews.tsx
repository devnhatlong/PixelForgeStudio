"use client";

import { useEffect, useRef } from "react";
import type { RgbaImage } from "@/lib/png-to-pixel";
import type { Point2 } from "@/types/sprite";

export type PreviewBg = "checker" | "dark" | "light";

const BG_CLASS: Record<PreviewBg, string> = { checker: "checker", dark: "pv-dark", light: "pv-light" };

/**
 * Pixel sprite preview, drawn with nearest-neighbour only. The background is CSS (never baked into exported PNGs).
 * overlay = master silhouette drawn on top at `overlayOpacity`.
 */
export function PixelPreview({
  width,
  height,
  pixels,
  zoom,
  bg = "checker",
  overlay,
  overlayOpacity = 0.4,
  anchor,
}: {
  width: number;
  height: number;
  pixels: string[];
  zoom: number;
  bg?: PreviewBg;
  overlay?: string[] | null;
  overlayOpacity?: number;
  anchor?: Point2 | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = width * zoom;
    c.height = height * zoom;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      if (!p) continue;
      ctx.fillStyle = p;
      ctx.fillRect((i % width) * zoom, Math.floor(i / width) * zoom, zoom, zoom);
    }
    if (overlay && overlay.length === pixels.length) {
      ctx.globalAlpha = overlayOpacity;
      ctx.fillStyle = "#ff3df2";
      for (let i = 0; i < overlay.length; i++) {
        if (!overlay[i]) continue;
        ctx.fillRect((i % width) * zoom, Math.floor(i / width) * zoom, zoom, zoom);
      }
      ctx.globalAlpha = 1;
    }
    if (anchor) {
      ctx.strokeStyle = "rgba(47,211,207,0.9)";
      ctx.lineWidth = 1;
      const y = (anchor.y + 1) * zoom - 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(c.width, y);
      ctx.moveTo(anchor.x * zoom + 0.5, 0);
      ctx.lineTo(anchor.x * zoom + 0.5, c.height);
      ctx.stroke();
    }
  }, [width, height, pixels, zoom, overlay, overlayOpacity, anchor]);
  return <canvas ref={ref} className={`pv-canvas ${BG_CLASS[bg]}`} style={{ width: width * zoom, height: height * zoom }} />;
}

/** Full-resolution raster preview scaled to fit `maxSize` (CSS pixels). */
export function RgbaPreview({ image, maxSize = 360, bg = "checker", className = "" }: { image: RgbaImage | null; maxSize?: number; bg?: PreviewBg; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !image) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  }, [image]);
  if (!image) return null;
  const k = Math.min(1, maxSize / Math.max(image.width, image.height));
  return <canvas ref={ref} className={`pv-canvas ${BG_CLASS[bg]} ${className}`} style={{ width: image.width * k, height: image.height * k, imageRendering: "auto" }} />;
}

export function ZoomPicker({ value, onChange, options = [1, 2, 4, 8] }: { value: number; onChange: (n: number) => void; options?: number[] }) {
  return (
    <div className="seg">
      {options.map((z) => (
        <button key={z} className={value === z ? "active" : ""} onClick={() => onChange(z)} title={z === 1 ? "1× - tiêu chí đọc silhouette chính" : undefined}>
          {z}×
        </button>
      ))}
    </div>
  );
}

export function BgPicker({ value, onChange }: { value: PreviewBg; onChange: (b: PreviewBg) => void }) {
  return (
    <div className="seg">
      <button className={value === "checker" ? "active" : ""} onClick={() => onChange("checker")}>Caro</button>
      <button className={value === "dark" ? "active" : ""} onClick={() => onChange("dark")}>Tối</button>
      <button className={value === "light" ? "active" : ""} onClick={() => onChange("light")}>Sáng</button>
    </div>
  );
}
