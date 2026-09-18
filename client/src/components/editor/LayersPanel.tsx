"use client";

import { useState } from "react";
import { Layers, Plus, Eye, EyeOff, Lock, LockOpen, ChevronUp, ChevronDown, Copy, ArrowDownToLine, Trash2 } from "lucide-react";
import { useEditorStore } from "@/store/editor-store";

export function LayersPanel() {
  const layers = useEditorStore((s) => s.doc?.layers ?? []);
  const layerId = useEditorStore((s) => s.layerId);
  const setLayerId = useEditorStore((s) => s.setLayerId);
  const addLayer = useEditorStore((s) => s.addLayer);
  const duplicateLayer = useEditorStore((s) => s.duplicateLayer);
  const deleteLayer = useEditorStore((s) => s.deleteLayer);
  const moveLayer = useEditorStore((s) => s.moveLayer);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const mergeLayerDown = useEditorStore((s) => s.mergeLayerDown);
  const [editing, setEditing] = useState<string | null>(null);

  // display top layer first
  const ordered = layers.slice().reverse();

  return (
    <aside className="side-panel layers-panel">
      <div className="panel-head">
        <span className="with-icon"><Layers size={15} /> Các Lớp (Layers)</span>
        <button className="btn-mini primary" onClick={addLayer}><Plus size={13} /> Thêm Layer</button>
      </div>
      <div className="layer-list">
        {ordered.map((l, k) => {
          const idx = layers.length - 1 - k;
          return (
            <div key={l.id} className={`layer-item ${l.id === layerId ? "active" : ""}`} onClick={() => setLayerId(l.id)}>
              <div className="layer-row">
                <button className={`icon-btn sm ${l.visible ? "" : "off"}`} title="Ẩn/hiện" onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { visible: !l.visible }); }}>
                  {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button className={`icon-btn sm ${l.locked ? "on" : ""}`} title="Khóa" onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { locked: !l.locked }); }}>
                  {l.locked ? <Lock size={14} /> : <LockOpen size={14} />}
                </button>
                {editing === l.id ? (
                  <input
                    autoFocus
                    className="layer-name-input"
                    defaultValue={l.name}
                    onBlur={(e) => { updateLayer(l.id, { name: e.target.value || l.name }); setEditing(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="layer-name" onDoubleClick={() => setEditing(l.id)}>{l.name}</span>
                )}
                <div className="layer-actions">
                  <button className="icon-btn sm" title="Lên" disabled={idx === layers.length - 1} onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }}><ChevronUp size={14} /></button>
                  <button className="icon-btn sm" title="Xuống" disabled={idx === 0} onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }}><ChevronDown size={14} /></button>
                </div>
              </div>
              <div className="layer-row">
                <span className="muted small">Độ mờ</span>
                <input type="range" min={0} max={100} value={Math.round(l.opacity * 100)} onChange={(e) => updateLayer(l.id, { opacity: Number(e.target.value) / 100 })} onClick={(e) => e.stopPropagation()} />
                <span className="small">{Math.round(l.opacity * 100)}%</span>
                <button className="icon-btn sm" title="Nhân bản" onClick={(e) => { e.stopPropagation(); duplicateLayer(l.id); }}><Copy size={13} /></button>
                <button className="icon-btn sm" title="Gộp xuống" disabled={idx === 0} onClick={(e) => { e.stopPropagation(); mergeLayerDown(l.id); }}><ArrowDownToLine size={13} /></button>
                <button className="icon-btn sm danger" title="Xóa" disabled={layers.length <= 1} onClick={(e) => { e.stopPropagation(); if (confirm(`Xóa layer "${l.name}"?`)) deleteLayer(l.id); }}><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
