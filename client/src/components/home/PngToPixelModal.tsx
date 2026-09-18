"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageDown, ImageUp, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PALETTES } from "@/lib/palettes";
import { imageToDocument, imageToPixels, loadImage } from "@/lib/png-to-pixel";
import type { PixelDocument } from "@/types/editor";

export function PngToPixelModal({ onClose, onCreate }: { onClose: () => void; onCreate: (doc: PixelDocument) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [size, setSize] = useState(32);
  const [keepRatio, setKeepRatio] = useState(true);
  const [maxColors, setMaxColors] = useState(16);
  const [paletteId, setPaletteId] = useState<string>("auto");
  const [alpha, setAlpha] = useState(128);
  const [preview, setPreview] = useState("");

  const dims = useMemo(() => {
    if (!img) return { width: size, height: size };
    if (!keepRatio) return { width: size, height: size };
    const ratio = img.naturalWidth / img.naturalHeight;
    return ratio >= 1
      ? { width: size, height: Math.max(1, Math.round(size / ratio)) }
      : { width: Math.max(1, Math.round(size * ratio)), height: size };
  }, [img, size, keepRatio]);

  const opts = useMemo(
    () => ({
      ...dims,
      maxColors,
      palette: paletteId === "auto" ? null : PALETTES.find((p) => p.id === paletteId)?.colors ?? null,
      alphaThreshold: alpha,
    }),
    [dims, maxColors, paletteId, alpha],
  );

  useEffect(() => {
    if (!img) return;
    const { pixels } = imageToPixels(img, opts);
    const scale = Math.max(1, Math.floor(240 / Math.max(dims.width, dims.height)));
    const c = document.createElement("canvas");
    c.width = dims.width * scale;
    c.height = dims.height * scale;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < pixels.length; i++) {
      if (!pixels[i]) continue;
      ctx.fillStyle = pixels[i];
      ctx.fillRect((i % dims.width) * scale, Math.floor(i / dims.width) * scale, scale, scale);
    }
    setPreview(c.toDataURL());
  }, [img, opts, dims]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImg(await loadImage(file));
      setFileName(file.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <Modal title="PNG to Pixel" subtitle="Chuyển ảnh PNG/JPG thành sprite pixel art có thể chỉnh sửa" icon={ImageDown} onClose={onClose} width={720}>
      <div className="export-body">
        <div
          className="export-preview checker dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files[0]);
          }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="preview" className="export-img" />
          ) : (
            <label className="drop-label">
              <span className="zip-icon"><ImageUp size={28} /></span>
              <strong>Kéo thả ảnh vào đây</strong>
              <span className="muted small">hoặc bấm để chọn file PNG / JPG</span>
              <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          )}
          {img && (
            <div className="muted small preview-caption">
              {img.naturalWidth}×{img.naturalHeight} → {dims.width}×{dims.height} px
              {" · "}
              <label className="link-btn">
                đổi ảnh
                <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
            </div>
          )}
        </div>
        <div className="export-options">
          <label className="field-label">Kích thước cạnh lớn: {size}px</label>
          <input type="range" min={8} max={192} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          <label className="check-row">
            <input type="checkbox" checked={keepRatio} onChange={(e) => setKeepRatio(e.target.checked)} /> Giữ tỉ lệ ảnh gốc
          </label>
          <label className="field-label">Bảng màu:</label>
          <select className="select" value={paletteId} onChange={(e) => setPaletteId(e.target.value)}>
            <option value="auto">Tự động (median cut)</option>
            {PALETTES.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {paletteId === "auto" && (
            <>
              <label className="field-label">Số màu tối đa: {maxColors}</label>
              <input type="range" min={2} max={64} value={maxColors} onChange={(e) => setMaxColors(Number(e.target.value))} />
            </>
          )}
          <label className="field-label">Ngưỡng trong suốt (alpha): {alpha}</label>
          <input type="range" min={0} max={255} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
          <button className="btn-primary big" disabled={!img} onClick={() => img && onCreate(imageToDocument(img, fileName || "Imported Sprite", opts))}>
            <Sparkles size={15} /> Tạo Sprite từ ảnh ({dims.width}×{dims.height})
          </button>
        </div>
      </div>
    </Modal>
  );
}
