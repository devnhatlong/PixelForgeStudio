"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, ArrowRight, ArrowLeft, ArrowLeftRight, Layers2, Copy, Trash2, Plus, Tag, Ruler, Ghost, AlignVerticalJustifyEnd, MonitorPlay, X, Check } from "lucide-react";
import { useEditorStore } from "@/store/editor-store";
import { alignAllFrames, deleteTag, docAnchor, upsertTag, useAnimStore, validTags, type GhostMode } from "@/store/anim-store";
import { useAppStore } from "@/store/app-store";
import { renderFrameToCanvas } from "@/lib/raster";
import { flattenFrame } from "@/lib/sprite/meta";
import { footAlignment, footJitter } from "@/lib/sprite/align";
import { ensureLocalDocument } from "@/lib/sync";
import { Select } from "@/components/ui/Select";
import { GamePreviewModal } from "./GamePreviewModal";
import { ANIMATION_STATES, TAG_COLORS } from "@/lib/sprite/anim-states";
import type { Frame, PixelDocument } from "@/types/editor";
import type { AnimationState, AnimationTag } from "@/types/sprite";

export { ANIMATION_STATES, TAG_COLORS };

function FrameThumb({ doc, frame }: { doc: PixelDocument; frame: Frame }) {
  const src = useMemo(() => {
    const scale = Math.max(1, Math.floor(48 / Math.max(doc.width, doc.height)));
    return renderFrameToCanvas(doc, frame, scale).toDataURL();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.layers, frame, doc.width, doc.height]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="frame-thumb" draggable={false} />;
}

/** Small form to add / edit an animation state tag. */
function TagForm({ doc, initial, onClose }: { doc: PixelDocument; initial: Partial<AnimationTag>; onClose: () => void }) {
  const n = doc.frames.length;
  const [state, setState] = useState<AnimationState>(initial.state ?? "idle");
  const preset = ANIMATION_STATES.find((s) => s.value === state)!;
  const [name, setName] = useState(initial.name ?? preset.label);
  const [from, setFrom] = useState((initial.from ?? 0) + 1);
  const [to, setTo] = useState((initial.to ?? n - 1) + 1);
  const [fps, setFps] = useState(initial.fps ?? preset.fps);
  const [loop, setLoop] = useState(initial.loop ?? preset.loop);
  const clamp = (v: number) => Math.max(1, Math.min(n, Math.round(v) || 1));
  return (
    <div className="tag-form">
      <Select<AnimationState>
        size="sm"
        value={state}
        onChange={(v) => {
          const p = ANIMATION_STATES.find((s) => s.value === v)!;
          setState(v);
          if (!initial.id) {
            setName(p.value === "custom" ? "" : p.label);
            setFps(p.fps);
            setLoop(p.loop);
          }
        }}
        options={ANIMATION_STATES.map((s) => ({ value: s.value, label: s.label, hint: `${s.fps} FPS · ${s.loop ? "lặp" : "1 lần"}` }))}
      />
      <input className="num-input name" placeholder="tên clip" value={name} onChange={(e) => setName(e.target.value)} />
      <span className="small muted">frame</span>
      <input className="num-input" type="number" min={1} max={n} value={from} onChange={(e) => setFrom(clamp(Number(e.target.value)))} />
      <span className="small muted">→</span>
      <input className="num-input" type="number" min={1} max={n} value={to} onChange={(e) => setTo(clamp(Number(e.target.value)))} />
      <input className="num-input" type="number" min={1} max={60} value={fps} onChange={(e) => setFps(Math.max(1, Math.min(60, Number(e.target.value) || 8)))} title="FPS" />
      <span className="small muted">FPS</span>
      <label className="check-row inline"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Lặp</label>
      <button
        className="btn-primary sm"
        disabled={!name.trim()}
        onClick={() => {
          upsertTag({ id: initial.id, name: name.trim(), state, from: Math.min(from, to) - 1, to: Math.max(from, to) - 1, fps, loop });
          onClose();
        }}
      >
        <Check size={13} /> {initial.id ? "Lưu" : "Thêm nhãn"}
      </button>
      {initial.id && (
        <button className="icon-btn sm danger" title="Xóa nhãn" onClick={() => { deleteTag(initial.id!); onClose(); }}><Trash2 size={13} /></button>
      )}
      <button className="icon-btn sm" title="Đóng" onClick={onClose}><X size={13} /></button>
    </div>
  );
}

export function Timeline() {
  const doc = useEditorStore((s) => s.doc);
  const frameIndex = useEditorStore((s) => s.frameIndex);
  const setFrameIndex = useEditorStore((s) => s.setFrameIndex);
  const addFrame = useEditorStore((s) => s.addFrame);
  const duplicateFrame = useEditorStore((s) => s.duplicateFrame);
  const deleteFrame = useEditorStore((s) => s.deleteFrame);
  const moveFrame = useEditorStore((s) => s.moveFrame);
  const setFrameDuration = useEditorStore((s) => s.setFrameDuration);
  const setAllDurations = useEditorStore((s) => s.setAllDurations);
  const playing = useEditorStore((s) => s.playing);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const fps = useEditorStore((s) => s.fps);
  const setFps = useEditorStore((s) => s.setFps);
  const onionSkin = useEditorStore((s) => s.onionSkin);
  const toggleOnionSkin = useEditorStore((s) => s.toggleOnionSkin);
  const notify = useAppStore((s) => s.notify);
  const { showGuides, toggleGuides, ghost, setGhost, ghostOpacity, setGhostOpacity, setGhostPixels, activeTagId, setActiveTag } = useAnimStore();
  const [direction, setDirection] = useState<"forward" | "backward" | "pingpong">("forward");
  const dirRef = useRef(1);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [tagForm, setTagForm] = useState<Partial<AnimationTag> | null>(null);
  const [gamePreview, setGamePreview] = useState(false);

  const tags = useMemo(() => (doc ? validTags(doc) : []), [doc]);
  const activeTag = tags.find((t) => t.id === activeTagId) ?? null;

  // foot positions of all frames → jitter readout
  const jitter = useMemo(() => {
    if (!doc || doc.frames.length < 2) return null;
    return footJitter(footAlignment(doc.frames.map((_, i) => flattenFrame(doc, i)), docAnchor(doc)));
  }, [doc]);

  // ghost source
  const masterId = doc?.sprite?.masterId ?? null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!doc || ghost === "off") return setGhostPixels(null);
      if (ghost === "first") return setGhostPixels(frameIndex === 0 ? null : flattenFrame(doc, 0).pixels);
      if (!masterId) return setGhostPixels(null);
      const m = await ensureLocalDocument(masterId).catch(() => undefined);
      if (!cancelled) setGhostPixels(m && m.width === doc.width && m.height === doc.height ? flattenFrame(m).pixels : null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost, masterId, frameIndex, ghost === "first" ? doc?.frames[0] : null]);

  // playback loop honoring per-frame duration (or the active tag's range + fps)
  useEffect(() => {
    if (!playing || !doc) return;
    let timer: ReturnType<typeof setTimeout>;
    const range = () => {
      const s = useEditorStore.getState();
      const t = activeTag && s.doc ? validTags(s.doc).find((x) => x.id === activeTag.id) : null;
      return t ? { from: t.from, to: t.to, ms: 1000 / t.fps, loop: t.loop } : { from: 0, to: (s.doc?.frames.length ?? 1) - 1, ms: 0, loop: true };
    };
    const delay = (i: number) => {
      const r = range();
      return r.ms || (useEditorStore.getState().doc?.frames[i]?.duration ?? 1000 / useEditorStore.getState().fps);
    };
    const tick = () => {
      const s = useEditorStore.getState();
      if (!s.doc) return;
      const r = range();
      let cur = s.frameIndex < r.from || s.frameIndex > r.to ? r.from : s.frameIndex;
      let next: number;
      if (direction === "forward") next = cur + 1 > r.to ? (r.loop ? r.from : r.to) : cur + 1;
      else if (direction === "backward") next = cur - 1 < r.from ? (r.loop ? r.to : r.from) : cur - 1;
      else {
        if (cur + dirRef.current > r.to || cur + dirRef.current < r.from) dirRef.current *= -1;
        next = r.from === r.to ? r.from : cur + dirRef.current;
      }
      cur = next;
      s.setFrameIndex(next);
      if (!r.loop && direction === "forward" && next === r.to) {
        timer = setTimeout(() => useEditorStore.getState().setPlaying(false), delay(next));
        return;
      }
      timer = setTimeout(tick, delay(next));
    };
    const start = range();
    if (frameIndex < start.from || frameIndex > start.to) setFrameIndex(start.from);
    timer = setTimeout(tick, delay(frameIndex));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, direction, activeTagId]);

  if (!doc) return null;
  const current = doc.frames[frameIndex];
  const tagOf = (i: number) => tags.filter((t) => i >= t.from && i <= t.to);

  const runAlign = (axes: "both" | "y") => {
    const infos = alignAllFrames(axes);
    const moved = infos.filter((i) => i.dx || i.dy).length;
    const empty = infos.filter((i) => !i.foot).length;
    notify(moved ? `Đã căn chân ${moved} frame về mốc${axes === "y" ? " (chỉ mặt đất)" : ""}${empty ? ` · ${empty} frame trống` : ""} — Ctrl+Z để hoàn tác` : "Các frame đã nằm đúng mốc chân", moved ? "success" : "info");
  };

  return (
    <section className="timeline">
      <div className="timeline-bar">
        <button className={`btn-play ${playing ? "on" : ""}`} onClick={() => setPlaying(!playing)}>
          {playing ? <><Pause size={15} /> Dừng</> : <><Play size={15} /> Phát{activeTag ? ` ${activeTag.name}` : ""}</>}
        </button>
        <div className="seg">
          <button className={direction === "forward" ? "active" : ""} onClick={() => setDirection("forward")} title="Tiến"><ArrowRight size={14} /></button>
          <button className={direction === "backward" ? "active" : ""} onClick={() => setDirection("backward")} title="Lùi"><ArrowLeft size={14} /></button>
          <button className={direction === "pingpong" ? "active" : ""} onClick={() => setDirection("pingpong")} title="Qua lại"><ArrowLeftRight size={14} /></button>
        </div>
        <FrameThumb doc={doc} frame={current} />
        <span className="small">
          Frame {frameIndex + 1}/{doc.frames.length}
        </span>
        <span className="small">FPS:</span>
        <input type="range" min={1} max={60} value={fps} onChange={(e) => { setFps(Number(e.target.value)); setAllDurations(1000 / Number(e.target.value)); }} style={{ width: 80 }} />
        <span className="small">{fps}</span>
        <input type="number" className="num-input" min={10} max={5000} value={current.duration} onChange={(e) => setFrameDuration(frameIndex, Number(e.target.value))} title="Thời lượng frame này (ms)" />
        <span className="small muted">ms</span>
        <div className="spacer" />
        <button className={`btn-ghost sm ${showGuides ? "on" : ""}`} onClick={toggleGuides} title="Ground line + mốc chân (pivot)"><Ruler size={14} /> Ground</button>
        <div className="ghost-ctl" title="Bóng mờ tham chiếu để căn frame">
          <Ghost size={14} />
          <div className="seg">
            {(["off", "first", "master"] as GhostMode[]).map((g) => (
              <button key={g} className={ghost === g ? "active" : ""} disabled={g === "master" && !masterId} onClick={() => setGhost(g)} title={g === "master" && !masterId ? "Sprite này không có master" : undefined}>
                {g === "off" ? "Tắt" : g === "first" ? "Frame 1" : "Master"}
              </button>
            ))}
          </div>
          {ghost !== "off" && <input type="range" min={10} max={80} value={Math.round(ghostOpacity * 100)} onChange={(e) => setGhostOpacity(Number(e.target.value) / 100)} style={{ width: 60 }} />}
        </div>
        <button className="btn-ghost sm" onClick={() => runAlign("both")} title="Pivot lock: dời mọi frame để chân nằm đúng mốc (cả ngang & dọc)"><AlignVerticalJustifyEnd size={14} /> Căn chân</button>
        <button className="btn-ghost sm" onClick={() => runAlign("y")} title="Chỉ đưa chân về mặt đất, giữ chuyển động ngang (đi/chạy)">Chỉ mặt đất</button>
        {jitter && (
          <span className={`chip ${jitter.x > 2 || jitter.y > 1 ? "warm" : ""}`} title="Độ lệch vị trí chân giữa các frame (px)">
            lệch chân ↔{jitter.x} ↕{jitter.y}
          </span>
        )}
        <button className={`btn-ghost sm ${onionSkin ? "on" : ""}`} onClick={toggleOnionSkin}><Layers2 size={14} /> Onion</button>
        <button className="btn-ghost sm" onClick={() => { setPlaying(false); setGamePreview(true); }} title="Xem animation trên nền game thử"><MonitorPlay size={14} /> Xem trong game</button>
        <button className="icon-btn" title="Nhân bản frame" onClick={() => duplicateFrame()}><Copy size={15} /></button>
        <button className="icon-btn danger" title="Xóa frame" disabled={doc.frames.length <= 1} onClick={() => deleteFrame()}><Trash2 size={15} /></button>
      </div>

      <div className="tag-bar">
        <Tag size={13} className="muted" />
        <button className={`tag-chip ${!activeTagId ? "active" : ""}`} onClick={() => setActiveTag(null)}>Tất cả</button>
        {tags.map((t) => (
          <button
            key={t.id}
            className={`tag-chip ${activeTagId === t.id ? "active" : ""}`}
            style={{ ["--tag" as string]: TAG_COLORS[t.state] }}
            onClick={() => { setActiveTag(t.id); setFrameIndex(t.from); }}
            onDoubleClick={() => setTagForm(t)}
            title={`${t.name}: frame ${t.from + 1}–${t.to + 1} · ${t.fps} FPS · ${t.loop ? "lặp" : "1 lần"} (nhấp đúp để sửa)`}
          >
            <span className="dot" /> {t.name} <span className="muted">{t.from + 1}–{t.to + 1}</span>
          </button>
        ))}
        <button className="chip-btn" onClick={() => setTagForm({ from: frameIndex, to: doc.frames.length - 1 })}><Plus size={12} /> Nhãn trạng thái</button>
        {tagForm && <TagForm key={tagForm.id ?? "new"} doc={doc} initial={tagForm} onClose={() => setTagForm(null)} />}
      </div>

      <div className="frame-strip">
        {doc.frames.map((f, i) => {
          const ft = tagOf(i);
          const dim = activeTag && (i < activeTag.from || i > activeTag.to);
          return (
            <div
              key={f.id}
              className={`frame-card ${i === frameIndex ? "active" : ""} ${dragFrom === i ? "dragging" : ""} ${dim ? "dim" : ""}`}
              onClick={() => setFrameIndex(i)}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragFrom !== null) moveFrame(dragFrom, i); setDragFrom(null); }}
              onDragEnd={() => setDragFrom(null)}
              title={`${f.duration} ms${ft.length ? ` · ${ft.map((t) => t.name).join(", ")}` : ""}`}
            >
              <span className="frame-num">#{i + 1}</span>
              <FrameThumb doc={doc} frame={f} />
              {ft.length > 0 && (
                <span className="frame-tags">
                  {ft.map((t) => <span key={t.id} style={{ background: TAG_COLORS[t.state] }} />)}
                </span>
              )}
            </div>
          );
        })}
        <button className="frame-card add" onClick={addFrame}>
          <Plus size={20} />
          <span className="small">Thêm</span>
        </button>
      </div>
      {gamePreview && <GamePreviewModal onClose={() => setGamePreview(false)} />}
    </section>
  );
}
