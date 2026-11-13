"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Film, Grid3x3, Pause, Play, ScanSearch, SquarePlus, CheckSquare, XSquare, PenSquare, Trash2, Copy } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Loading";
import type { RgbaImage } from "@/lib/png-to-pixel";
import type { AnimationState, CleanupConfig, SpritePreset } from "@/types/sprite";
import type { PixelDocument } from "@/types/editor";
import { createDocument, uid } from "@/lib/document";
import { cropCells, detectSprites, foregroundMask, gridCells, groupRows, type GridSpec, type Rect } from "@/lib/sprite/slicer";
import { buildAnimationFrames, type AnimationResult, type FrameAlign } from "@/lib/sprite/animation";
import { rgbaToCanvas } from "@/lib/sprite/assets";
import { BgPicker, PixelPreview, type PreviewBg } from "./Previews";
import { ANIMATION_STATES } from "@/lib/sprite/anim-states";

/** max upscale of small sheets in the view */
const MAX_VIEW_SCALE = 3;

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
  const [method, setMethod] = useState<"auto" | "grid" | "manual">("auto");
  const [manualRects, setManualRects] = useState<Rect[]>([]);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [clipState, setClipState] = useState<AnimationState>("idle");
  const [clipName, setClipName] = useState("Idle");
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
  // fit the sheet into the available stage area (re-measured on window resize)
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 900, h: 600 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.max(200, e.contentRect.width), h: Math.max(200, e.contentRect.height - 28) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = Math.min(MAX_VIEW_SCALE, box.w / image.width, box.h / image.height);

  const fgMask = useMemo(() => foregroundMask(image, cleanup), [image, cleanup]);
  const autoRects = useMemo(() => detectSprites(image, { cleanup, minGap, mask: fgMask }), [image, cleanup, minGap, fgMask]);
  const rects: Rect[] = useMemo(
    () => (method === "auto" ? autoRects : method === "manual" ? manualRects : gridCells(image.width, image.height, grid)),
    [method, autoRects, manualRects, image, grid],
  );
  /** cells whose content touches the cell border → effect / weapon probably cut by the frame (grid & manual only) */
  const touching = useMemo(() => {
    if (method === "auto") return new Set<number>();
    const out = new Set<number>();
    const W = image.width;
    rects.forEach((r, i) => {
      const x1 = Math.min(W, r.x + r.w) - 1,
        y1 = Math.min(image.height, r.y + r.h) - 1;
      for (let x = r.x; x <= x1 && !out.has(i); x++) if (fgMask[r.y * W + x] || fgMask[y1 * W + x]) out.add(i);
      for (let y = r.y; y <= y1 && !out.has(i); y++) if (fgMask[y * W + r.x] || fgMask[y * W + x1]) out.add(i);
    });
    return out;
  }, [method, rects, fgMask, image]);
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
    if (method === "manual" && !manualRects.length) setManualRects(autoRects);
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
    ctx.imageSmoothingEnabled = k < 1; // smooth when shrinking, crisp pixels when enlarging
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
      if (touching.has(i)) {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        ctx.setLineDash([]);
      }
      if (on) {
        const n = String(order.indexOf(i) + 1);
        const tw = ctx.measureText(n).width + 8;
        ctx.fillStyle = "#0fa9ab";
        ctx.fillRect(x, y, tw, 15);
        ctx.fillStyle = "#fff";
        ctx.fillText(n, x + 4, y + 11);
      }
    });
    if (draft) {
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.min(draft.x0, draft.x1) * k, Math.min(draft.y0, draft.y1) * k, Math.abs(draft.x1 - draft.x0) * k, Math.abs(draft.y1 - draft.y0) * k);
      ctx.setLineDash([]);
    }
  }, [rects, selected, order, image, k, touching, draft]);

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

  const toImg = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(image.width, ((e.clientX - b.left) / b.width) * image.width)), y: Math.max(0, Math.min(image.height, ((e.clientY - b.top) / b.height) * image.height)) };
  };
  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = toImg(e);
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draft || method !== "manual") return;
    const p = toImg(e);
    setDraft({ ...draft, x1: p.x, y1: p.y });
  };
  const onUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = draft;
    setDraft(null);
    if (!d) return;
    const big = Math.abs(d.x1 - d.x0) * k > 6 && Math.abs(d.y1 - d.y0) * k > 6;
    if (method === "manual" && big) {
      const r = { x: Math.round(Math.min(d.x0, d.x1)), y: Math.round(Math.min(d.y0, d.y1)), w: Math.round(Math.abs(d.x1 - d.x0)), h: Math.round(Math.abs(d.y1 - d.y0)) };
      setManualRects((rs) => [...rs, r]);
      setSelected((s) => new Set([...s, manualRects.length]));
      return;
    }
    toggleAt(e);
  };
  const toggleAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = toImg(e);
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
    doc.anchor = { ...preset.footAnchor };
    const st = ANIMATION_STATES.find((x) => x.value === clipState)!;
    doc.animations = [{ id: uid("tag"), name: clipName.trim() || st.label, state: clipState, from: 0, to: anim.frames.length - 1, fps, loop: st.loop }];
    doc.name = `${name} - ${clipName.trim() || st.label}`;
    onCreateAnimation(doc);
  };

  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  const current = anim?.frames[Math.min(frameIdx, (anim?.frames.length ?? 1) - 1)];

  return (
    <Modal title="Cắt sprite sheet" subtitle={`${image.width}×${image.height} · ${rects.length} ô · chọn ô theo thứ tự đọc (trái→phải, trên→dưới)`} icon={Grid3x3} onClose={onClose} width="min(1680px, calc(100vw - 32px))" className="modal-xl">
      <div className="slicer">
        <div className="slicer-stage" ref={stageRef}>
          <div className="slicer-canvas checker" style={{ width: Math.round(image.width * k), height: Math.round(image.height * k) }}>
            <canvas ref={baseRef} />
            <canvas ref={overlayRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => setDraft(null)} style={{ cursor: method === "manual" ? "crosshair" : "pointer" }} />
          </div>
          <p className="muted small">
            Bấm vào ô để chọn / bỏ chọn. Số trên ô = thứ tự frame.{method === "manual" && " Kéo chuột để vẽ ô mới."}
            {touching.size > 0 && <span className="danger-text"> {touching.size} ô có nội dung chạm mép (viền đỏ) — hiệu ứng / vũ khí có thể bị cắt: nới lưới hoặc vẽ ô lớn hơn.</span>}
          </p>
        </div>

        <div className="slicer-side forge">
          <div className="seg wide">
            <button className={method === "auto" ? "active" : ""} onClick={() => setMethod("auto")}><ScanSearch size={13} /> Tự dò</button>
            <button className={method === "grid" ? "active" : ""} onClick={() => setMethod("grid")}><Grid3x3 size={13} /> Lưới đều</button>
            <button className={method === "manual" ? "active" : ""} onClick={() => setMethod("manual")} title="Vẽ / sửa ô bằng tay"><PenSquare size={13} /> Thủ công</button>
          </div>

          {method === "auto" ? (
            <>
              <label className="field-label">Khoảng trống tối thiểu giữa các nhân vật: {minGap}px</label>
              <input type="range" min={1} max={40} value={minGap} onChange={(e) => setMinGap(Number(e.target.value))} />
              <p className="muted small">Tìm thấy {rects.length} nhân vật trong {rows.length} hàng. Nếu 2 nhân vật bị gộp làm một → giảm số này; nếu 1 nhân vật bị tách đôi → tăng lên.</p>
            </>
          ) : method === "manual" ? (
            <>
              <p className="muted small" style={{ marginTop: 10 }}>{rects.length} ô. Kéo trên ảnh để thêm ô; chọn ô rồi xóa ô sai.</p>
              <div className="row-chips">
                <button className="chip-btn" onClick={() => { setManualRects(autoRects); setSelected(new Set()); }}><Copy size={12} /> Lấy từ Tự dò</button>
                <button className="chip-btn danger" disabled={!selected.size} onClick={() => { setManualRects((rs) => rs.filter((_, i) => !selected.has(i))); setSelected(new Set()); }}><Trash2 size={12} /> Xóa ô đã chọn</button>
                <button className="chip-btn" onClick={() => { setManualRects([]); setSelected(new Set()); }}>Xóa hết</button>
              </div>
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
          <div className="grid2">
            <div>
              <label className="field-label">Trạng thái</label>
              <Select<AnimationState>
                size="sm"
                value={clipState}
                onChange={(v) => {
                  const st = ANIMATION_STATES.find((x) => x.value === v)!;
                  setClipState(v);
                  if (v !== "custom") setClipName(st.label);
                  setFps(st.fps);
                }}
                options={ANIMATION_STATES.map((x) => ({ value: x.value, label: x.label, hint: `${x.fps} FPS` }))}
              />
            </div>
            <div>
              <label className="field-label">Tên clip</label>
              <input className="text-input" style={{ height: 32 }} value={clipName} onChange={(e) => setClipName(e.target.value)} />
            </div>
          </div>
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
