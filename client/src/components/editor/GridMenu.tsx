"use client";

import { useEffect, useRef, useState } from "react";
import { Grid3x3, ChevronDown } from "lucide-react";
import { useEditorStore } from "@/store/editor-store";
import { autoGridSize } from "./PixelCanvas";

const PRESETS = [4, 8, 16, 32];

/** Topbar dropdown: pixel grid toggle + major grid (preset / auto / custom) + opacity. */
export function GridMenu() {
  const doc = useEditorStore((s) => s.doc);
  const showGrid = useEditorStore((s) => s.showGrid);
  const toggleGrid = useEditorStore((s) => s.toggleGrid);
  const gridSize = useEditorStore((s) => s.gridSize);
  const gridAuto = useEditorStore((s) => s.gridAuto);
  const gridOpacity = useEditorStore((s) => s.gridOpacity);
  const setGridSize = useEditorStore((s) => s.setGridSize);
  const setGridAuto = useEditorStore((s) => s.setGridAuto);
  const setGridOpacity = useEditorStore((s) => s.setGridOpacity);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(gridSize || 6);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  if (!doc) return null;
  const auto = autoGridSize(doc.width, doc.height);
  const effective = gridAuto ? auto : gridSize;
  const active = showGrid || effective >= 2;
  const isPreset = !gridAuto && PRESETS.includes(gridSize);
  const isCustom = !gridAuto && gridSize >= 2 && !isPreset;

  return (
    <div className="grid-menu" ref={ref}>
      <button className={`btn-ghost ${active ? "on" : ""}`} onClick={() => setOpen(!open)} title="Cài đặt lưới">
        <Grid3x3 size={15} /> Lưới{effective >= 2 ? ` ${effective}px` : ""} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="popover">
          <label className="check-row" style={{ marginTop: 0 }}>
            <input type="checkbox" checked={showGrid} onChange={toggleGrid} /> Pixel Grid <span className="muted small">(mỗi ô = 1 pixel)</span>
          </label>

          <div className="popover-title">Major Grid <span className="muted small">— lớp kẻ ô phụ trợ, không ảnh hưởng ảnh</span></div>
          <div className="seg wide">
            <button className={!gridAuto && gridSize === 0 ? "active" : ""} onClick={() => setGridSize(0)}>Tắt</button>
            {PRESETS.map((n) => (
              <button key={n} className={!gridAuto && gridSize === n ? "active" : ""} onClick={() => setGridSize(n)}>{n}</button>
            ))}
            <button className={gridAuto ? "active" : ""} onClick={() => setGridAuto(true)} title={`Tự chọn theo canvas: ${doc.width}×${doc.height} → ${auto}px`}>Auto</button>
          </div>
          <div className="grid-custom">
            <span className={`small ${isCustom ? "accent" : "muted"}`}>Tùy chỉnh:</span>
            <input
              type="number"
              className="num-input"
              min={2}
              max={64}
              value={custom}
              onChange={(e) => setCustom(Number(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && setGridSize(custom)}
            />
            <span className="muted small">px</span>
            <button className="btn-mini" onClick={() => setGridSize(custom)}>Áp dụng</button>
          </div>
          {effective >= 2 && (
            <div className="muted small">
              Canvas {doc.width}×{doc.height} → {Math.ceil(doc.width / effective)} ô ngang × {Math.ceil(doc.height / effective)} ô dọc
              {gridAuto && ` (auto ${auto}px)`}
            </div>
          )}

          <div className="popover-title">Độ đậm lưới: {Math.round(gridOpacity * 100)}%</div>
          <input type="range" min={10} max={100} value={Math.round(gridOpacity * 100)} onChange={(e) => setGridOpacity(Number(e.target.value) / 100)} style={{ width: "100%" }} />
        </div>
      )}
    </div>
  );
}
