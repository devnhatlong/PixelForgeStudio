"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Film, Grid3x3, Pause, Play, ScanSearch, SquarePlus, CheckSquare, XSquare } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Loading";
import type { RgbaImage } from "@/lib/png-to-pixel";
import type { CleanupConfig, SpritePreset } from "@/types/sprite";
import type { PixelDocument } from "@/types/editor";
import { createDocument, uid } from "@/lib/document";
import { cropCells, detectSprites, foregroundMask, gridCells, groupRows, type GridSpec, type Rect } from "@/lib/sprite/slicer";
import { buildAnimationFrames, type AnimationResult, type FrameAlign } from "@/lib/sprite/animation";
import { rgbaToCanvas } from "@/lib/sprite/assets";
import { BgPicker, PixelPreview, type PreviewBg } from "./Previews";

const VIEW_MAX = 640;

export interface SlicedCell {
  rgba: RgbaImage;
  label: string;
}

export function SheetSlicerModal({
  image,
  name,
  preset,
  cleanup,
  maxColors,
  alphaThreshold,
  resizeMethod,
  palette,
  onClose,
  onAddCandidates,
  onCreateAnimation,
}: {
  image: RgbaImage;
  name: string;
  preset: SpritePreset;
  cleanup: CleanupConfig;
  maxColors: number;
  alphaThreshold: number;
  resizeMethod: "box" | "nearest";
  palette: string[] | null;
  onClose: () => void;
  onAddCandidates: (cells: SlicedCell[]) => void;
  onCreateAnimation: (doc: PixelDocument) => void;
}) {
  const [method, setMethod] = useState<"auto" | "grid">("auto");
  const [grid, setGrid] = useState<GridSpec>({ rows: 2, cols: 4, marginX: 0, marginY: 0, gapX: 0, gapY: 0 });
  const [minGap, setMinGap] = useState(Math.max(2, Math.round(Math.min(image.width, image.height) / 200)));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [align, setAlign] = useState<FrameAlign>("foot");
  const [fps, setFps] = useState(8);
  const [playing, setPlaying] = useState(true);
  const [frameIdx, setFrameIdx] = useState(0);
  const [zoom, setZoom] = useState(2);
  const [bg, setBg] = useState<PreviewBg>("checker");
  const [anim, setAnim] = useState<AnimationResult | null>(null);
  const [building, setBuilding] = useState(false);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const k = Math.min(1, VIEW_MAX / Math.max(image.width, image.height));

  const fgMask = useMemo(() => foregroundMask(image, cleanup), [image, cleanup]);
  const autoRects = useMemo(() => detectSprites(image, { cleanup, minGap, mask: fgMask }), [image, cleanup, minGap, fgMask]);
  const rects: Rect[] = useMemo(() => (method === "auto" ? autoRects : gridCells(image.width, image.height, grid)), [method, autoRects, image, grid]);
  const rows = useMemo(() => groupRows(rects), [rects]);

  // first open: guess the grid from auto-detection, preselect the first row
  useEffect(() => {
    const r = groupRows(autoRects);
    if (r.length) {
      setGrid((g) => ({ ...g, rows: r.length, cols: Math.max(...r.map((x) => x.length)) }));
      setSelected(new Set(r[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setAlign(method === "grid" ? "cell" : "foot");
    setSelected((s) => new Set([...s].filter((i) => i < rects.length)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  // frames = selected cells in reading order
  const order = useMemo(() => rows.flat().filter((i) => selected.has(i)), [rows, selected]);

  // base image
  useEffect(() => {
    const c = baseRef.current;
    if (!c) return;
    c.width = Math.round(image.width * k);
    c.height = Math.round(image.height * k);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(rgbaToCanvas(image), 0, 0, c.width, c.height);
  }, [image, k]);

  // overlay: cell boxes + frame numbers
  useEffect(() => {
    const c = overlayRef.current;
    if (!c) return;
    c.width = Math.round(image.width * k);
    c.height = Math.round(image.height * k);
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = "bold 11px Segoe UI, sans-serif";
    rects.forEach((r, i) => {
      const on = selected.has(i);
      const x = r.x * k + 0.5,
        y = r.y * k + 0.5,
        w = r.w * k - 1,
        h = r.h * k - 1;
      ctx.fillStyle = on ? "rgba(15,169,171,0.18)" : "rgba(0,0,0,0.0)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = on ? "#2fd3cf" : "rgba(255,255,255,0.35)";
      ctx.lineWidth = on ? 2 : 1;
      ctx.strokeRect(x, y, w, h);
      if (on) {
        const n = String(order.indexOf(i) + 1);
        const tw = ctx.measureText(n).width + 8;
        ctx.fillStyle = "#0fa9ab";
        ctx.fillRect(x, y, tw, 15);
        ctx.fillStyle = "#fff";
        ctx.fillText(n, x + 4, y + 11);
      }
    });
  }, [rects, selected, order, image, k]);

  // build animation frames (debounced)
  useEffect(() => {
    if (!order.length) {
      setAnim(null);
      return;
    }
    setBuilding(true);
    const t = setTimeout(() => {
      try {
        setAnim(buildAnimationFrames(cropCells(image, order.map((i) => rects[i])), { preset, cleanup, maxColors, alphaThreshold, resizeMethod, palette, align }));
        setFrameIdx(0);
      } finally {
        setBuilding(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [order, rects, image, preset, cleanup, maxColors, alphaThreshold, resizeMethod, palette, align]);

  // playback
  useEffect(() => {
    if (!playing || !anim || anim.frames.length < 2) return;
    const t = setInterval(() => setFrameIdx((i) => (i + 1) % anim.frames.length), 1000 / fps);
    return () => clearInterval(t);
  }, [playing, anim, fps]);

  const toggleAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * image.width;
    const y = ((e.clientY - b.top) / b.height) * image.height;
    const i = rects.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (i < 0) return;
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  const createAnimation = () => {
    if (!anim) return;
    const doc = createDocument(`${name} - anim ${order.length}f`, preset.canvas.width, preset.canvas.height);
    const layerId = doc.layers[0].id;
    doc.layers[0].name = "Sprite";
    const duration = Math.round(1000 / fps);
    doc.frames = anim.frames.map((pixels) => ({ id: uid("f"), duration, cels: { [layerId]: pixels } }));
    doc.palette = anim.palette;
    onCreateAnimation(doc);
  };

  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  const current = anim?.frames[Math.min(frameIdx, (anim?.frames.length ?? 1) - 1)];

  return (
    <Modal title="Cắt sprite sheet" subtitle={`${image.width}×${image.height} · ${rects.length} ô · chọn ô theo thứ tự đọc (trái→phải, trên→dưới)`} icon={Grid3x3} onClose={onClose} width={1200}>
      <div className="slicer">
        <div className="slicer-stage">
          <div className="slicer-canvas checker" style={{ width: Math.round(image.width * k), height: Math.round(image.height * k) }}>
            <canvas ref={baseRef} />
            <canvas ref={overlayRef} onClick={toggleAt} style={{ cursor: "pointer" }} />
          </div>
          <p className="muted small">Bấm vào ô để chọn / bỏ chọn. Số trên ô = thứ tự frame.</p>
        </div>

        <div className="slicer-side forge">
          <div className="seg wide">
            <button className={method === "auto" ? "active" : ""} onClick={() => setMethod("auto")}><ScanSearch size={13} /> Tự dò</button>
            <button className={method === "grid" ? "active" : ""} onClick={() => setMethod("grid")}><Grid3x3 size={13} /> Lưới đều</button>
          </div>

          {method === "auto" ? (
            <>
              <label className="field-label">Khoảng trống tối thiểu giữa các nhân vật: {minGap}px</label>
              <input type="range" min={1} max={40} value={minGap} onChange={(e) => setMinGap(Number(e.target.value))} />
              <p className="muted small">Tìm thấy {rects.length} nhân vật trong {rows.length} hàng. Nếu 2 nhân vật bị gộp làm một → giảm số này; nếu 1 nhân vật bị tách đôi → tăng lên.</p>
            </>
          ) : (
            <div className="grid-spec">
              {([
                ["rows", "Hàng", 1, 64],
                ["cols", "Cột", 1, 64],
                ["marginX", "Lề ngang", 0, 500],
                ["marginY", "Lề dọc", 0, 500],
                ["gapX", "Khe ngang", 0, 200],
                ["gapY", "Khe dọc", 0, 200],
              ] as const).map(([key, label, min, max]) => (
                <div key={key}>
                  <label className="field-label">{label}</label>
                  <input className="text-input" type="number" min={min} max={max} value={grid[key]} onChange={(e) => setGrid({ ...grid, [key]: num(e.target.value, min, max) })} />
                </div>
              ))}
            </div>
          )}

          <label className="field-label">Chọn nhanh</label>
          <div className="row-chips">
            {rows.map((r, i) => {
              const all = r.every((x) => selected.has(x));
              return (
                <button key={i} className={`chip-btn ${all ? "on" : ""}`} onClick={() => setSelected(new Set(all ? [] : r))} title="Chỉ chọn hàng này (bấm lại để bỏ)">
                  Hàng {i + 1} <span className="muted">({r.length})</span>
                </button>
              );
            })}
            <button className="chip-btn" onClick={() => setSelected(new Set(rects.map((_, i) => i)))}><CheckSquare size={12} /> Tất cả</button>
            <button className="chip-btn" onClick={() => setSelected(new Set())}><XSquare size={12} /> Bỏ chọn</button>
          </div>

          <label className="field-label">Xem thử animation {building && <Spinner size={11} />}</label>
          <div className="anim-preview">
            {current ? (
              <PixelPreview width={preset.canvas.width} height={preset.canvas.height} pixels={current} zoom={zoom} bg={bg} anchor={preset.footAnchor} />
            ) : (
              <div className="empty small">Chọn ít nhất 1 ô</div>
            )}
          </div>
          <div className="anim-controls">
            <button className="icon-btn" onClick={() => setPlaying(!playing)} title={playing ? "Dừng" : "Phát"}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
            <span className="muted small">Frame {anim ? frameIdx + 1 : 0}/{anim?.frames.length ?? 0}</span>
            <div className="seg">
              {[1, 2, 3].map((z) => <button key={z} className={zoom === z ? "active" : ""} onClick={() => setZoom(z)}>{z}×</button>)}
            </div>
            <BgPicker value={bg} onChange={setBg} />
          </div>
          <label className="field-label">Tốc độ: {fps} FPS</label>
          <input type="range" min={1} max={24} value={fps} onChange={(e) => setFps(Number(e.target.value))} />
          <label className="field-label">Căn các frame</label>
          <Select<FrameAlign>
            value={align}
            onChange={setAlign}
            options={[
              { value: "cell", label: "Giữ vị trí trong ô", hint: "Giữ nguyên chuyển động gốc — hợp với lưới đều" },
              { value: "foot", label: "Theo chân từng frame", hint: "Mỗi frame đứng đúng mốc chân — hợp với tự dò" },
            ]}
          />
          {anim?.warnings.map((w, i) => <p key={i} className="note warn">{w}</p>)}

          <div className="slicer-actions">
            <button className="btn-ghost" disabled={!order.length} onClick={() => onAddCandidates(cropCells(image, order.map((i) => rects[i])).map((rgba, n) => ({ rgba, label: `ô ${n + 1}` })))}>
              <SquarePlus size={14} /> Thêm {order.length} ô vào phương án
            </button>
            <button className="btn-primary" disabled={!anim || !order.length} onClick={createAnimation}>
              <Film size={14} /> Tạo animation {order.length} frame & mở Editor
            </button>
          </div>
          <p className="muted small">Mọi frame dùng chung tỉ lệ, mốc chân và bảng màu → không rung, không nháy màu. Sửa tiếp & xuất GIF / sprite sheet trong Editor (Timeline).</p>
        </div>
      </div>
    </Modal>
  );
}
