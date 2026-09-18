"use client";

import { useState } from "react";
import { FilePlus2, Film } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SIZE_PRESETS, buildCatTemplate } from "@/lib/templates";
import { createDocument } from "@/lib/document";
import type { PixelDocument } from "@/types/editor";

export function NewSpriteModal({ onClose, onCreate }: { onClose: () => void; onCreate: (doc: PixelDocument) => void }) {
  const [name, setName] = useState("My Sprite");
  const [preset, setPreset] = useState<number | "custom">(32);
  const [cw, setCw] = useState(32);
  const [ch, setCh] = useState(32);

  const clamp = (n: number) => Math.max(16, Math.min(192, Math.round(n) || 16));
  const w = preset === "custom" ? clamp(cw) : preset;
  const h = preset === "custom" ? clamp(ch) : preset;

  return (
    <Modal title="Tạo Sprite Mới & Mẫu Hoạt Họa" icon={FilePlus2} onClose={onClose} width={560}>
      <label className="field-label">Mẫu thiết kế có sẵn:</label>
      <button className="template-card" onClick={() => onCreate(buildCatTemplate())}>
        <div className="template-head">
          <span className="template-title">🐱 Chú Mèo Vẫy Đuôi (5 Timelines)</span>
          <span className="chip warm"><Film size={11} /> 5 Frames Đuôi</span>
          <span className="chip">24x24 px</span>
        </div>
        <p className="small muted">Chú mèo cam mắt ngọc bích cực đáng yêu với chuỗi 5 frame hoạt họa vẫy đuôi mượt mà trên timeline!</p>
      </button>

      <label className="field-label" style={{ marginTop: 18 }}>Đặt tên Sprite:</label>
      <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Sprite" />

      <div className="preset-grid">
        {SIZE_PRESETS.map((p) => (
          <button key={p.size} className={`preset-card ${preset === p.size ? "active" : ""}`} onClick={() => setPreset(p.size)}>
            <div className="preset-head">
              <strong>{p.label}</strong>
              <span className="muted small">{p.size}px</span>
            </div>
            <span className="small muted">{p.desc}</span>
          </button>
        ))}
        <button className={`preset-card wide ${preset === "custom" ? "active" : ""}`} onClick={() => setPreset("custom")}>
          <div className="preset-head">
            <strong>Tùy chỉnh tự do (16 → 192)</strong>
            <span className="muted small">Custom W x H</span>
          </div>
          <span className="small muted">Nhập kích thước chiều rộng x chiều cao bất kỳ từ 16 đến 192 pixel</span>
          {preset === "custom" && (
            <div className="custom-size" onClick={(e) => e.stopPropagation()}>
              <input type="number" min={16} max={192} value={cw} onChange={(e) => setCw(Number(e.target.value))} />
              <span>×</span>
              <input type="number" min={16} max={192} value={ch} onChange={(e) => setCh(Number(e.target.value))} />
              <span className="muted small">px</span>
            </div>
          )}
        </button>
      </div>

      <button className="btn-primary big" onClick={() => onCreate(createDocument(name.trim() || "My Sprite", w, h))}>
        Tạo Sprite Mới ({w}x{h} px)
      </button>
    </Modal>
  );
}
