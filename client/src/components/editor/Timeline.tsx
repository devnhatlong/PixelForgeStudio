"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, ArrowRight, ArrowLeft, ArrowLeftRight, Layers2, Copy, Trash2, Plus } from "lucide-react";
import { useEditorStore } from "@/store/editor-store";
import { renderFrameToCanvas } from "@/lib/raster";
import type { Frame, PixelDocument } from "@/types/editor";

function FrameThumb({ doc, frame }: { doc: PixelDocument; frame: Frame }) {
  const src = useMemo(() => {
    const scale = Math.max(1, Math.floor(48 / Math.max(doc.width, doc.height)));
    return renderFrameToCanvas(doc, frame, scale).toDataURL();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.layers, frame, doc.width, doc.height]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="frame-thumb" draggable={false} />;
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
  const [direction, setDirection] = useState<"forward" | "backward" | "pingpong">("forward");
  const dirRef = useRef(1);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  // playback loop honoring per-frame duration
  useEffect(() => {
    if (!playing || !doc) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const s = useEditorStore.getState();
      if (!s.doc) return;
      const n = s.doc.frames.length;
      let next = s.frameIndex;
      if (direction === "forward") next = (s.frameIndex + 1) % n;
      else if (direction === "backward") next = (s.frameIndex - 1 + n) % n;
      else {
        if (s.frameIndex + dirRef.current >= n || s.frameIndex + dirRef.current < 0) dirRef.current *= -1;
        next = s.frameIndex + dirRef.current;
        if (n === 1) next = 0;
      }
      s.setFrameIndex(next);
      timer = setTimeout(tick, s.doc.frames[next]?.duration ?? 1000 / s.fps);
    };
    timer = setTimeout(tick, doc.frames[frameIndex]?.duration ?? 1000 / fps);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, direction]);

  if (!doc) return null;
  const current = doc.frames[frameIndex];

  return (
    <section className="timeline">
      <div className="timeline-bar">
        <button className={`btn-play ${playing ? "on" : ""}`} onClick={() => setPlaying(!playing)}>
          {playing ? <><Pause size={15} /> Dừng</> : <><Play size={15} /> Phát</>}
        </button>
        <div className="seg">
          <button className={direction === "forward" ? "active" : ""} onClick={() => setDirection("forward")} title="Tiến"><ArrowRight size={14} /></button>
          <button className={direction === "backward" ? "active" : ""} onClick={() => setDirection("backward")} title="Lùi"><ArrowLeft size={14} /></button>
          <button className={direction === "pingpong" ? "active" : ""} onClick={() => setDirection("pingpong")} title="Qua lại"><ArrowLeftRight size={14} /></button>
        </div>
        <FrameThumb doc={doc} frame={current} />
        <span className="small">
          Frame {frameIndex + 1}/{doc.frames.length}: <span className="accent">Frame {frameIndex + 1}</span>
        </span>
        <span className="small">FPS:</span>
        <input type="range" min={1} max={60} value={fps} onChange={(e) => { setFps(Number(e.target.value)); setAllDurations(1000 / Number(e.target.value)); }} style={{ width: 90 }} />
        <span className="small">{fps} FPS</span>
        <span className="small">Frame:</span>
        <input type="number" className="num-input" min={10} max={5000} value={current.duration} onChange={(e) => setFrameDuration(frameIndex, Number(e.target.value))} />
        <span className="small muted">ms</span>
        <div className="spacer" />
        <button className={`btn-ghost ${onionSkin ? "on" : ""}`} onClick={toggleOnionSkin}><Layers2 size={15} /> Onion Skin</button>
        <button className="icon-btn" title="Nhân bản frame" onClick={() => duplicateFrame()}><Copy size={15} /></button>
        <button className="icon-btn danger" title="Xóa frame" disabled={doc.frames.length <= 1} onClick={() => deleteFrame()}><Trash2 size={15} /></button>
      </div>
      <div className="frame-strip">
        {doc.frames.map((f, i) => (
          <div
            key={f.id}
            className={`frame-card ${i === frameIndex ? "active" : ""} ${dragFrom === i ? "dragging" : ""}`}
            onClick={() => setFrameIndex(i)}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragFrom !== null) moveFrame(dragFrom, i); setDragFrom(null); }}
            onDragEnd={() => setDragFrom(null)}
            title={`${f.duration} ms`}
          >
            <span className="frame-num">#{i + 1}</span>
            <FrameThumb doc={doc} frame={f} />
          </div>
        ))}
        <button className="frame-card add" onClick={addFrame}>
          <Plus size={20} />
          <span className="small">Thêm</span>
        </button>
      </div>
    </section>
  );
}
