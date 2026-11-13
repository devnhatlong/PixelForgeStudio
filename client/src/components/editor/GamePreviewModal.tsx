"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FlipHorizontal2, MonitorPlay, Pause, Play } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useEditorStore } from "@/store/editor-store";
import { docAnchor, validTags } from "@/store/anim-store";
import { renderFrameToCanvas } from "@/lib/raster";

const VIEW_W = 768;
const VIEW_H = 384;
const GROUND_Y = VIEW_H - 72;

type Scene = "dusk" | "day" | "night";
const SCENES: Record<Scene, { sky: [string, string]; far: string; mid: string; ground: string; groundTop: string; grout: string }> = {
  dusk: { sky: ["#2b1d3a", "#e0875a"], far: "#4b3557", mid: "#2f3b3a", ground: "#5a4632", groundTop: "#7a9a4a", grout: "#3f3122" },
  day: { sky: ["#6fb7e8", "#d8f0ff"], far: "#8fb3c9", mid: "#4f8a5b", ground: "#7a5c3c", groundTop: "#5fae4f", grout: "#5b4229" },
  night: { sky: ["#070a1a", "#1d2a4d"], far: "#18223d", mid: "#101a2b", ground: "#2e2a33", groundTop: "#3e5a4a", grout: "#1d1a21" },
};

/** Deterministic ridge line (no randomness → no flicker while scrolling). */
function ridge(x: number, base: number, amp: number, f: number) {
  return base - amp * (0.55 * Math.sin(x * f) + 0.3 * Math.sin(x * f * 2.3 + 1.7) + 0.15 * Math.sin(x * f * 5.1 + 0.4));
}

/**
 * Plays the current document (or one tag) on a simple side-scrolling test scene at the real pixel scale,
 * so walk/run cycles can be judged for foot sliding and readability.
 */
export function GamePreviewModal({ onClose }: { onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const tags = useMemo(() => (doc ? validTags(doc) : []), [doc]);
  const [tagId, setTagId] = useState<string>(tags[0]?.id ?? "all");
  const [scale, setScale] = useState(2);
  const [speed, setSpeed] = useState(() => (tags[0] && ["run", "walk"].includes(tags[0].state) ? (tags[0].state === "run" ? 120 : 50) : 0));
  const [flip, setFlip] = useState(false);
  const [scene, setScene] = useState<Scene>("dusk");
  const [playing, setPlaying] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const frames = useMemo(() => (doc ? doc.frames.map((f) => renderFrameToCanvas(doc, f, 1)) : []), [doc]);
  const tag = tags.find((t) => t.id === tagId) ?? null;

  useEffect(() => {
    if (!doc || !frames.length) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const anchor = docAnchor(doc);
    const range = tag ? { from: tag.from, to: tag.to } : { from: 0, to: frames.length - 1 };
    const frameMs = (i: number) => (tag ? 1000 / tag.fps : doc.frames[i]?.duration ?? 100);
    const loop = tag ? tag.loop : true;
    const pal = SCENES[scene];

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let idx = range.from;
    let hold = 0; // pause at the end of non-looping clips before restarting
    let scroll = 0;

    const draw = () => {
      ctx.imageSmoothingEnabled = false;
      const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      g.addColorStop(0, pal.sky[0]);
      g.addColorStop(1, pal.sky[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      // far mountains (slow parallax)
      ctx.fillStyle = pal.far;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      for (let x = 0; x <= VIEW_W; x += 4) ctx.lineTo(x, ridge(x + scroll * 0.2, GROUND_Y - 120, 70, 0.006));
      ctx.lineTo(VIEW_W, GROUND_Y);
      ctx.fill();
      // mid hills
      ctx.fillStyle = pal.mid;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      for (let x = 0; x <= VIEW_W; x += 4) ctx.lineTo(x, ridge(x + scroll * 0.5, GROUND_Y - 40, 35, 0.012));
      ctx.lineTo(VIEW_W, GROUND_Y);
      ctx.fill();
      // ground: grass top + stone tiles, moves 1:1 with the character speed
      ctx.fillStyle = pal.ground;
      ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
      ctx.fillStyle = pal.groundTop;
      ctx.fillRect(0, GROUND_Y, VIEW_W, 6);
      ctx.fillStyle = pal.grout;
      const tile = 32;
      const off = ((scroll % tile) + tile) % tile;
      for (let row = 0; row < 3; row++) {
        const y = GROUND_Y + 6 + row * 22;
        ctx.fillRect(0, y, VIEW_W, 2);
        for (let x = -off + (row % 2 ? tile / 2 : 0); x < VIEW_W; x += tile) ctx.fillRect(Math.round(x), y, 2, 22);
      }
      // character: feet anchor on the ground line
      const f = frames[idx];
      const w = f.width * scale,
        h = f.height * scale;
      const cx = VIEW_W / 2;
      const ax = (flip ? f.width - 1 - anchor.x : anchor.x) * scale;
      const x = Math.round(cx - ax);
      const y = Math.round(GROUND_Y - (anchor.y + 1) * scale);
      // soft shadow
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(cx, GROUND_Y + 2, 14 * scale, 3 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      if (flip) {
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(f, 0, 0, w, h);
      } else ctx.drawImage(f, x, y, w, h);
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "12px Segoe UI, sans-serif";
      ctx.fillText(`${tag ? tag.name : "Tất cả"} · frame ${idx + 1} · ${scale}×`, 10, 18);
    };

    const step = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (playing) {
        scroll += ((flip ? -1 : 1) * speed * dt) / 1000;
        if (hold > 0) {
          hold -= dt;
          if (hold <= 0) idx = range.from;
        } else {
          acc += dt;
          while (acc >= frameMs(idx)) {
            acc -= frameMs(idx);
            if (idx >= range.to) {
              if (loop) idx = range.from;
              else {
                hold = 600;
                break;
              }
            } else idx++;
          }
        }
      }
      draw();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [doc, frames, tag, scale, speed, flip, scene, playing]);

  if (!doc) return null;
  return (
    <Modal title="Xem trong game" subtitle="Nền thử nghiệm kiểu đi cảnh ngang — kiểm tra trượt chân, độ đọc ở kích thước thật" icon={MonitorPlay} onClose={onClose} width={820}>
      <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="game-canvas" />
      <div className="game-controls forge">
        <button className="icon-btn" onClick={() => setPlaying(!playing)} title={playing ? "Dừng" : "Phát"}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <div style={{ width: 200 }}>
          <Select
            size="sm"
            value={tagId}
            onChange={(v) => {
              setTagId(v);
              const t = tags.find((x) => x.id === v);
              setSpeed(t?.state === "run" ? 120 : t?.state === "walk" ? 50 : 0);
            }}
            options={[{ value: "all", label: "Tất cả frame" }, ...tags.map((t) => ({ value: t.id, label: t.name, hint: `${t.from + 1}–${t.to + 1} · ${t.fps} FPS${t.loop ? " · lặp" : ""}` }))]}
          />
        </div>
        <div className="seg">
          {[1, 2, 3, 4].map((s) => <button key={s} className={scale === s ? "active" : ""} onClick={() => setScale(s)}>{s}×</button>)}
        </div>
        <label className="small muted">Cuộn nền {speed}px/s</label>
        <input type="range" min={0} max={300} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ width: 120 }} />
        <button className={`btn-ghost sm ${flip ? "on" : ""}`} onClick={() => setFlip(!flip)} title="Lật hướng (đi sang trái)"><FlipHorizontal2 size={14} /> Lật</button>
        <div className="seg">
          {(["dusk", "day", "night"] as Scene[]).map((s) => <button key={s} className={scene === s ? "active" : ""} onClick={() => setScene(s)}>{s === "dusk" ? "Hoàng hôn" : s === "day" ? "Ngày" : "Đêm"}</button>)}
        </div>
      </div>
      <p className="muted small">
        Đi/chạy: chỉnh tốc độ cuộn nền đến khi chân không “trượt” trên mặt đất — đó là tốc độ di chuyển nên dùng trong Unity ({speed / scale} px/s ở 1×).
        {!tags.length && " Chưa có nhãn trạng thái — thêm ở thanh Timeline để xem từng clip."}
      </p>
    </Modal>
  );
}
