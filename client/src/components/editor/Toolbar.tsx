"use client";

import { useEffect } from "react";
import {
  Brush, Eraser, PaintBucket, Pipette, SquareDashed, Wand2, Move, Hand, ZoomIn, Minus, Square, Circle,
  Grid2x2, Sun, Moon, FlipHorizontal2, FlipVertical2, Ban, Plus, type LucideIcon,
} from "lucide-react";
import { useEditorStore } from "@/store/editor-store";
import type { EditorTool, MirrorMode } from "@/types/editor";

export const TOOLS: { id: EditorTool; name: string; desc: string; key: string; icon: LucideIcon }[] = [
  { id: "pencil", name: "Cọ vẽ", desc: "Vẽ điểm ảnh tự do", key: "B", icon: Brush },
  { id: "eraser", name: "Cọ tẩy", desc: "Xóa điểm ảnh về trong suốt", key: "E", icon: Eraser },
  { id: "fill", name: "Thùng đổ màu", desc: "Tô đầy vùng cùng màu", key: "G", icon: PaintBucket },
  { id: "eyedropper", name: "Chấm hút màu", desc: "Lấy màu từ điểm ảnh", key: "I", icon: Pipette },
  { id: "select", name: "Vùng chọn chữ nhật", desc: "Khoanh vùng chọn", key: "M", icon: SquareDashed },
  { id: "wand", name: "Đũa thần", desc: "Chọn vùng thông minh", key: "W", icon: Wand2 },
  { id: "move", name: "Di chuyển", desc: "Điều chỉnh vị trí nội dung", key: "V", icon: Move },
  { id: "hand", name: "Kéo màn hình", desc: "Kéo (hoặc giữ Space)", key: "H", icon: Hand },
  { id: "zoom", name: "Phóng to / Thu nhỏ", desc: "Click phóng to, Alt thu nhỏ", key: "Z", icon: ZoomIn },
  { id: "line", name: "Đường thẳng", desc: "Vẽ đường thẳng", key: "L", icon: Minus },
  { id: "rect", name: "Hình chữ nhật", desc: "Vẽ khung chữ nhật", key: "U", icon: Square },
  { id: "ellipse", name: "Hình tròn", desc: "Vẽ đường cong tròn", key: "C", icon: Circle },
  { id: "dither", name: "Dither Caro", desc: "Kỹ thuật hòa trộn màu", key: "J", icon: Grid2x2 },
  { id: "lighten", name: "Làm sáng nét", desc: "Nâng sáng tông màu", key: "O", icon: Sun },
  { id: "darken", name: "Làm tối nét", desc: "Hạ tối tông màu", key: "K", icon: Moon },
];

export function useEditorShortcuts(opts: { onSave?: () => void; onExport?: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const s = useEditorStore.getState();
      if (!s.doc) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === "z" && !e.shiftKey) {
        e.preventDefault();
        s.undo();
        return;
      }
      if ((ctrl && key === "y") || (ctrl && e.shiftKey && key === "z")) {
        e.preventDefault();
        s.redo();
        return;
      }
      if (ctrl && key === "s") {
        e.preventDefault();
        opts.onSave?.();
        return;
      }
      if (ctrl && key === "e") {
        e.preventDefault();
        opts.onExport?.();
        return;
      }
      if (ctrl && key === "a") {
        e.preventDefault();
        s.selectAll();
        return;
      }
      if (ctrl && key === "d") {
        e.preventDefault();
        s.setSelection(null);
        return;
      }
      if (key === "delete" || key === "backspace") {
        if (s.floating) s.cancelFloating();
        else if (s.selection) s.deleteSelection();
        return;
      }
      if (key === "escape") {
        if (s.floating) s.commitFloating();
        s.setSelection(null);
        return;
      }
      if (key === "x" && !ctrl) {
        s.swapColors();
        return;
      }
      if (key === "[") {
        s.setBrushSize(s.brushSize - 1);
        return;
      }
      if (key === "]") {
        s.setBrushSize(s.brushSize + 1);
        return;
      }
      if (key === "," ) {
        s.setFrameIndex(s.frameIndex - 1);
        return;
      }
      if (key === ".") {
        s.setFrameIndex(s.frameIndex + 1);
        return;
      }
      if (key === "enter" && !ctrl) {
        s.setPlaying(!s.playing);
        return;
      }
      if (key === "+" || key === "=") {
        s.setZoom(s.zoom + 2);
        return;
      }
      if (key === "-") {
        s.setZoom(s.zoom - 2);
        return;
      }
      if (ctrl) return;
      const tool = TOOLS.find((t) => t.key.toLowerCase() === key);
      if (tool) s.setTool(tool.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [opts]);
}

export function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const mirror = useEditorStore((s) => s.mirror);
  const setMirror = useEditorStore((s) => s.setMirror);
  const flipLayer = useEditorStore((s) => s.flipLayer);

  const mirrorBtn = (m: MirrorMode, label: string, Icon: LucideIcon) => (
    <button key={m} className={`mirror-btn ${mirror === m ? "active" : ""}`} onClick={() => setMirror(m)}>
      <Icon size={13} /> {label}
    </button>
  );

  return (
    <aside className="toolbar">
      <div className="toolbar-head">
        <span>Thanh Công Cụ</span>
        <span className="muted">Phím tắt</span>
      </div>
      <div className="tool-list">
        {TOOLS.map((t) => (
          <button key={t.id} className={`tool-item ${tool === t.id ? "active" : ""}`} onClick={() => setTool(t.id)} title={`${t.name} (${t.key})`}>
            <span className="tool-icon"><t.icon size={16} /></span>
            <span className="tool-text">
              <span className="tool-name">{t.name}</span>
              <span className="tool-desc">{t.desc}</span>
            </span>
            <kbd>{t.key}</kbd>
          </button>
        ))}
      </div>
      <div className="toolbar-section">
        <div className="toolbar-head">
          <span>Đối Xứng Gương</span>
          <span className="muted">{mirror === "off" ? "Tắt" : "Bật"}</span>
        </div>
        <div className="mirror-row">
          {mirrorBtn("off", "Tắt", Ban)}
          {mirrorBtn("horizontal", "Ngang", FlipHorizontal2)}
          {mirrorBtn("vertical", "Dọc", FlipVertical2)}
          {mirrorBtn("both", "Cả hai", Plus)}
        </div>
        <div className="mirror-row">
          <button className="mirror-btn" onClick={() => flipLayer("h")}><FlipHorizontal2 size={13} /> Lật ngang</button>
          <button className="mirror-btn" onClick={() => flipLayer("v")}><FlipVertical2 size={13} /> Lật dọc</button>
        </div>
      </div>
    </aside>
  );
}
