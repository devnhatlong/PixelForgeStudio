"use client";

import { useEffect, useRef, useState } from "react";
import { Brush, Eraser, Shirt, Trash2 } from "lucide-react";
import type { RgbaImage } from "@/lib/png-to-pixel";
import { alphaBBox } from "@/lib/sprite/normalize";
import { detectBackground, removeBackground, DEFAULT_CLEANUP } from "@/lib/sprite/background";

/** Mask raster (1 = area the AI may change). */
export type MaskData = Uint8Array;

export function maskToRgba(mask: MaskData, w: number, h: number): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = mask[i] ? 255 : 0;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

/** "Outfit below the neck" suggestion: character pixels below ~1/3 of its height (head ≈ 1/3 in the chibi preset). */
export function suggestOutfitMask(ref: RgbaImage, headRatio = 0.34): MaskData {
  const guess = detectBackground(ref);
  const cleaned = guess.alreadyTransparent ? ref : removeBackground(ref, DEFAULT_CLEANUP).image;
  const bb = alphaBBox(cleaned);
  const mask = new Uint8Array(ref.width * ref.height);
  if (!bb) return mask;
  const y0 = Math.round(bb.y + bb.h * headRatio);
  const pad = Math.round(Math.max(ref.width, ref.height) * 0.01);
  for (let y = Math.max(0, y0); y < Math.min(ref.height, bb.y + bb.h + pad); y++)
    for (let x = Math.max(0, bb.x - pad); x < Math.min(ref.width, bb.x + bb.w + pad); x++) {
      // include pixels near the character so the new outfit may be slightly wider
      let near = false;
      for (let dy = -pad; dy <= pad && !near; dy += Math.max(1, pad)) for (let dx = -pad; dx <= pad && !near; dx += Math.max(1, pad)) {
        const nx = x + dx,
          ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < ref.width && ny < ref.height && cleaned.data[(ny * ref.width + nx) * 4 + 3] >= 128) near = true;
      }
      if (near) mask[y * ref.width + x] = 1;
    }
  return mask;
}

export function MaskPainter({ reference, mask, onChange, maxSize = 380 }: { reference: RgbaImage; mask: MaskData | null; onChange: (m: MaskData | null) => void; maxSize?: number }) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<"brush" | "erase">("brush");
  const [size, setSize] = useState(Math.round(Math.max(reference.width, reference.height) / 24));
  const painting = useRef(false);
  const working = useRef<MaskData>(mask ?? new Uint8Array(reference.width * reference.height));
  const k = Math.min(1, maxSize / Math.max(reference.width, reference.height));

  useEffect(() => {
    working.current = mask ? mask.slice() : new Uint8Array(reference.width * reference.height);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mask, reference]);

  useEffect(() => {
    const c = baseRef.current;
    if (!c) return;
    c.width = reference.width;
    c.height = reference.height;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(reference.data), reference.width, reference.height), 0, 0);
  }, [reference]);

  function redraw() {
    const c = overlayRef.current;
    if (!c) return;
    c.width = reference.width;
    c.height = reference.height;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(reference.width, reference.height);
    const m = working.current;
    for (let i = 0; i < m.length; i++) {
      if (!m[i]) continue;
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 40;
      img.data[i * 4 + 2] = 120;
      img.data[i * 4 + 3] = 120;
    }
    ctx.putImageData(img, 0, 0);
  }

  function paintAt(e: React.PointerEvent) {
    const rect = overlayRef.current!.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * reference.width;
    const cy = ((e.clientY - rect.top) / rect.height) * reference.height;
    const r = size / 2;
    const m = working.current;
    const v = tool === "brush" ? 1 : 0;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(reference.height, cy + r); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(reference.width, cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * reference.width + x] = v;
    redraw();
  }

  const commit = () => {
    const m = working.current;
    onChange(m.some((v) => v) ? m.slice() : null);
  };

  return (
    <div className="mask-painter">
      <div className="mask-tools">
        <div className="seg">
          <button className={tool === "brush" ? "active" : ""} onClick={() => setTool("brush")} title="Tô vùng được phép đổi"><Brush size={13} /> Tô</button>
          <button className={tool === "erase" ? "active" : ""} onClick={() => setTool("erase")} title="Bỏ tô (giữ nguyên vùng này)"><Eraser size={13} /> Bỏ</button>
        </div>
        <input type="range" min={2} max={Math.round(Math.max(reference.width, reference.height) / 6)} value={size} onChange={(e) => setSize(Number(e.target.value))} title={`Cỡ cọ ${size}px`} />
        <button className="btn-ghost sm" onClick={() => onChange(suggestOutfitMask(reference))} title="Tự tô phần thân dưới cổ (trang phục); mặt/tóc được bảo vệ"><Shirt size={13} /> Gợi ý: trang phục</button>
        <button className="btn-ghost sm" onClick={() => onChange(null)}><Trash2 size={13} /> Xóa mask</button>
      </div>
      <div className="mask-stage checker" style={{ width: reference.width * k, height: reference.height * k }}>
        <canvas ref={baseRef} style={{ width: "100%", height: "100%" }} />
        <canvas
          ref={overlayRef}
          style={{ width: "100%", height: "100%", cursor: "crosshair", touchAction: "none" }}
          onPointerDown={(e) => {
            painting.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            paintAt(e);
          }}
          onPointerMove={(e) => painting.current && paintAt(e)}
          onPointerUp={() => {
            painting.current = false;
            commit();
          }}
        />
      </div>
      <p className="muted small">Vùng tô hồng = AI được phép thay đổi. Phần còn lại (mặt, tóc, dáng) được yêu cầu giữ nguyên - nhưng không có provider nào bảo đảm 100%.</p>
    </div>
  );
}
