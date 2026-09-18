"use client";

import { useState } from "react";
import { ArrowLeftRight, Palette, Plus } from "lucide-react";
import { useEditorStore } from "@/store/editor-store";
import { PALETTES } from "@/lib/palettes";
import { normalizeHex } from "@/lib/color";

export function ColorPanel() {
  const primary = useEditorStore((s) => s.primary);
  const secondary = useEditorStore((s) => s.secondary);
  const setPrimary = useEditorStore((s) => s.setPrimary);
  const setSecondary = useEditorStore((s) => s.setSecondary);
  const swapColors = useEditorStore((s) => s.swapColors);
  const brushSize = useEditorStore((s) => s.brushSize);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const paletteId = useEditorStore((s) => s.paletteId);
  const setPaletteId = useEditorStore((s) => s.setPaletteId);
  const recent = useEditorStore((s) => s.recentColors);
  const customPalette = useEditorStore((s) => s.doc?.palette ?? []);
  const addPaletteColor = useEditorStore((s) => s.addPaletteColor);
  const removePaletteColor = useEditorStore((s) => s.removePaletteColor);

  const [tab, setTab] = useState<"swatches" | "custom">("swatches");
  const [hexInput, setHexInput] = useState(primary);
  const [lastPrimary, setLastPrimary] = useState(primary);
  if (lastPrimary !== primary) {
    setLastPrimary(primary);
    setHexInput(primary);
  }

  const palette = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];

  const commitHex = () => {
    const n = normalizeHex(hexInput);
    if (n) setPrimary(n);
    else setHexInput(primary);
  };

  const Swatch = ({ c, removable }: { c: string; removable?: boolean }) => (
    <button
      className={`swatch ${primary === c ? "active" : ""}`}
      style={{ background: c }}
      title={c}
      onClick={() => setPrimary(c)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (removable) removePaletteColor(c);
        else setSecondary(c);
      }}
    />
  );

  return (
    <aside className="side-panel color-panel">
      <div className="panel-head">
        <span className="with-icon"><Palette size={15} /> Bảng Màu</span>
        <div className="seg">
          <button className={tab === "swatches" ? "active" : ""} onClick={() => setTab("swatches")}>Swatches</button>
          <button className={tab === "custom" ? "active" : ""} onClick={() => setTab("custom")}>Tùy chỉnh</button>
        </div>
      </div>

      <div className="color-pair">
        <div className="color-stack">
          <label className="color-box primary" style={{ background: primary }} title="Màu chính">
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} />
          </label>
          <label className="color-box secondary" style={{ background: secondary }} title="Màu phụ (chuột phải)">
            <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} />
          </label>
        </div>
        <button className="icon-btn" onClick={swapColors} title="Hoán đổi (X)"><ArrowLeftRight size={15} /></button>
        <div className="hex-field">
          <span>PRI</span>
          <input value={hexInput} onChange={(e) => setHexInput(e.target.value)} onBlur={commitHex} onKeyDown={(e) => e.key === "Enter" && commitHex()} />
        </div>
      </div>

      <div className="panel-sub">
        <span>Cỡ nét bút:</span>
        <span className="accent">{brushSize}px</span>
      </div>
      <div className="brush-row">
        {[1, 2, 3, 4].map((n) => (
          <button key={n} className={`brush-btn ${brushSize === n ? "active" : ""}`} onClick={() => setBrushSize(n)}>
            <span className="brush-dot" style={{ width: 3 + n * 2, height: 3 + n * 2 }} />
            <span>{n}px</span>
          </button>
        ))}
      </div>
      <div className="brush-custom">
        <input type="range" min={1} max={64} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} title="Cỡ nét tùy chỉnh (1–64)" />
        <input type="number" className="num-input" min={1} max={64} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
        <span className="muted small">px</span>
      </div>

      {tab === "swatches" ? (
        <>
          <div className="panel-sub">Bảng màu tiêu chuẩn:</div>
          <select className="select" value={paletteId} onChange={(e) => setPaletteId(e.target.value)}>
            {PALETTES.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="panel-sub">
            <span>Màu trong bộ ({palette.colors.length})</span>
            <button className="link-btn" onClick={() => addPaletteColor(primary)}><Plus size={12} /> Thêm</button>
          </div>
          <div className="swatch-grid">
            {palette.colors.map((c) => <Swatch key={c} c={c} />)}
          </div>
        </>
      ) : (
        <>
          <div className="panel-sub">
            <span>Bảng màu của sprite ({customPalette.length})</span>
            <button className="link-btn" onClick={() => addPaletteColor(primary)}><Plus size={12} /> Thêm màu hiện tại</button>
          </div>
          <div className="swatch-grid">
            {customPalette.length === 0 && <div className="muted small">Chưa có màu. Bấm "+ Thêm" để lưu màu đang chọn. Chuột phải để xóa.</div>}
            {customPalette.map((c) => <Swatch key={c} c={c} removable />)}
          </div>
        </>
      )}

      <div className="panel-sub">Vừa sử dụng:</div>
      <div className="swatch-grid recent-box">
        {recent.length === 0 && <span className="muted small">Chưa có</span>}
        {recent.map((c) => <Swatch key={c} c={c} />)}
      </div>
    </aside>
  );
}
