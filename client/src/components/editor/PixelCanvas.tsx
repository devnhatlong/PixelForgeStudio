"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore, type PaintMode } from "@/store/editor-store";
import {
  bresenham,
  brushPoints,
  compositeFrame,
  ellipseOutline,
  floodFill,
  mirrorPoints,
  rectOutline,
  rectSelection,
  selectionFromIndices,
  type Point,
} from "@/lib/raster";

type DragState =
  | { kind: "paint"; mode: PaintMode; last: Point }
  | { kind: "shape"; start: Point; current: Point }
  | { kind: "select"; start: Point; current: Point }
  | { kind: "move"; start: Point }
  | { kind: "pan"; startX: number; startY: number; scrollLeft: number; scrollTop: number }
  | null;

const TOOL_CURSORS: Record<string, string> = {
  hand: "grab",
  move: "move",
  zoom: "zoom-in",
  eyedropper: "crosshair",
  select: "crosshair",
  wand: "crosshair",
};

export function PixelCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const dragRef = useRef<DragState>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const doc = useEditorStore((s) => s.doc);
  const frameIndex = useEditorStore((s) => s.frameIndex);
  const layerId = useEditorStore((s) => s.layerId);
  const zoom = useEditorStore((s) => s.zoom);
  const showGrid = useEditorStore((s) => s.showGrid);
  const onionSkin = useEditorStore((s) => s.onionSkin);
  const tool = useEditorStore((s) => s.tool);
  const primary = useEditorStore((s) => s.primary);
  const brushSize = useEditorStore((s) => s.brushSize);
  const mirror = useEditorStore((s) => s.mirror);
  const selection = useEditorStore((s) => s.selection);
  const floating = useEditorStore((s) => s.floating);
  const playing = useEditorStore((s) => s.playing);

  const setDragBoth = (d: DragState) => {
    dragRef.current = d;
    setDrag(d);
  };

  // --- keyboard: space for panning
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        setSpaceHeld(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // --- rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !doc) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = doc;
    canvas.width = width * zoom;
    canvas.height = height * zoom;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!offscreenRef.current) offscreenRef.current = document.createElement("canvas");
    const off = offscreenRef.current;
    off.width = width;
    off.height = height;
    const octx = off.getContext("2d")!;

    const blit = (data: Uint8ClampedArray<ArrayBuffer>, alpha = 1) => {
      octx.putImageData(new ImageData(data, width, height), 0, 0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    };

    const frame = doc.frames[frameIndex];

    if (onionSkin && !playing) {
      const prev = doc.frames[frameIndex - 1];
      const next = doc.frames[frameIndex + 1];
      if (prev) blit(compositeFrame(doc, prev), 0.3);
      if (next) blit(compositeFrame(doc, next), 0.2);
    }

    blit(compositeFrame(doc, frame));

    // floating buffer
    if (floating) {
      ctx.globalAlpha = 0.95;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          const p = floating.pixels[i];
          if (!p) continue;
          ctx.fillStyle = p;
          ctx.fillRect((x + floating.offsetX) * zoom, (y + floating.offsetY) * zoom, zoom, zoom);
        }
      ctx.globalAlpha = 1;
    }

    // shape / selection preview
    const d = dragRef.current;
    if (d && d.kind === "shape") {
      const pts = shapePoints(tool, d.start, d.current, brushSize, mirror, width, height);
      ctx.fillStyle = tool === "eraser" ? "rgba(255,255,255,0.4)" : primary;
      for (const p of pts) ctx.fillRect(p.x * zoom, p.y * zoom, zoom, zoom);
    }
    if (d && d.kind === "select") {
      const x0 = Math.min(d.start.x, d.current.x);
      const y0 = Math.min(d.start.y, d.current.y);
      const w = Math.abs(d.current.x - d.start.x) + 1;
      const h = Math.abs(d.current.y - d.start.y) + 1;
      ctx.strokeStyle = "#2fd3cf";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 * zoom + 0.5, y0 * zoom + 0.5, w * zoom - 1, h * zoom - 1);
      ctx.setLineDash([]);
    }

    // grid
    if (showGrid && zoom >= 6) {
      ctx.strokeStyle = "rgba(255,255,255,0.09)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= width; x++) {
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, canvas.height);
      }
      for (let y = 0; y <= height; y++) {
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(canvas.width, y * zoom + 0.5);
      }
      ctx.stroke();
    }

    // selection outline (marching ants style)
    if (selection) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      const m = selection.mask;
      const ox = floating ? floating.offsetX : 0;
      const oy = floating ? floating.offsetY : 0;
      ctx.beginPath();
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          if (!m[i]) continue;
          const px = (x + ox) * zoom;
          const py = (y + oy) * zoom;
          if (y === 0 || !m[i - width]) {
            ctx.moveTo(px, py + 0.5);
            ctx.lineTo(px + zoom, py + 0.5);
          }
          if (y === height - 1 || !m[i + width]) {
            ctx.moveTo(px, py + zoom - 0.5);
            ctx.lineTo(px + zoom, py + zoom - 0.5);
          }
          if (x === 0 || !m[i - 1]) {
            ctx.moveTo(px + 0.5, py);
            ctx.lineTo(px + 0.5, py + zoom);
          }
          if (x === width - 1 || !m[i + 1]) {
            ctx.moveTo(px + zoom - 0.5, py);
            ctx.lineTo(px + zoom - 0.5, py + zoom);
          }
        }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // hover brush cursor
    if (hover && !playing && ["pencil", "eraser", "dither", "lighten", "darken", "line", "rect", "ellipse"].includes(tool)) {
      const pts = mirrorPoints(brushPoints(hover.x, hover.y, brushSize), mirror, width, height);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1;
      for (const p of pts) ctx.strokeRect(p.x * zoom + 0.5, p.y * zoom + 0.5, zoom - 1, zoom - 1);
    }

    // mirror axis guides
    if (mirror !== "off") {
      ctx.strokeStyle = "rgba(15,169,171,0.6)";
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      if (mirror === "horizontal" || mirror === "both") {
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
      }
      if (mirror === "vertical" || mirror === "both") {
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [doc, frameIndex, zoom, showGrid, onionSkin, tool, primary, brushSize, mirror, selection, floating, drag, hover, playing, layerId]);

  const toPixel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: Math.floor((e.clientX - rect.left) / zoom), y: Math.floor((e.clientY - rect.top) / zoom) };
    },
    [zoom],
  );

  const getStage = (el: HTMLElement | null) => el?.closest(".stage") as HTMLElement | null;

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = useEditorStore.getState();
    if (!s.doc || playing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPixel(e);
    const { width, height } = s.doc;
    const isRight = e.button === 2;

    if (spaceHeld || tool === "hand" || e.button === 1) {
      const stage = getStage(e.currentTarget);
      setDragBoth({ kind: "pan", startX: e.clientX, startY: e.clientY, scrollLeft: stage?.scrollLeft ?? 0, scrollTop: stage?.scrollTop ?? 0 });
      return;
    }

    switch (tool) {
      case "pencil":
      case "eraser":
      case "dither":
      case "lighten":
      case "darken": {
        const mode: PaintMode = isRight ? "erase" : tool === "pencil" ? "color" : tool === "eraser" ? "erase" : tool;
        s.pushHistory();
        s.paintPoints(mirrorPoints(brushPoints(p.x, p.y, brushSize), mirror, width, height), mode);
        setDragBoth({ kind: "paint", mode, last: p });
        break;
      }
      case "fill": {
        const layer = s.doc.layers.find((l) => l.id === s.layerId);
        if (!layer || layer.locked) return;
        const px = s.doc.frames[s.frameIndex].cels[layer.id];
        const idx = floodFill(px, width, height, p.x, p.y, s.selection?.mask);
        if (idx.length) {
          s.pushHistory();
          s.fillIndices(idx, isRight ? null : s.primary);
        }
        break;
      }
      case "eyedropper": {
        pickColor(p, isRight);
        break;
      }
      case "select":
        if (s.floating) s.commitFloating();
        setDragBoth({ kind: "select", start: p, current: p });
        break;
      case "wand": {
        if (s.floating) s.commitFloating();
        const px = s.doc.frames[s.frameIndex].cels[s.layerId];
        if (!px) return;
        const idx = floodFill(px, width, height, p.x, p.y);
        s.setSelection(selectionFromIndices(idx, width, height));
        break;
      }
      case "move": {
        if (!s.floating) s.liftFloating();
        setDragBoth({ kind: "move", start: p });
        break;
      }
      case "zoom": {
        s.setZoom(e.altKey ? Math.max(1, Math.round(zoom / 1.5)) : Math.min(64, Math.round(zoom * 1.5)));
        break;
      }
      case "line":
      case "rect":
      case "ellipse":
        s.pushHistory();
        setDragBoth({ kind: "shape", start: p, current: p });
        break;
    }
  };

  const pickColor = (p: Point, secondary: boolean) => {
    const s = useEditorStore.getState();
    if (!s.doc) return;
    const data = compositeFrame(s.doc, s.doc.frames[s.frameIndex]);
    const i = (p.y * s.doc.width + p.x) * 4;
    if (data[i + 3] === 0) return;
    const hex = `#${[data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    if (secondary) s.setSecondary(hex);
    else s.setPrimary(hex);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toPixel(e);
    setHover(p);
    const d = dragRef.current;
    if (!d) return;
    const s = useEditorStore.getState();
    if (!s.doc) return;
    const { width, height } = s.doc;

    switch (d.kind) {
      case "paint": {
        if (d.last.x === p.x && d.last.y === p.y) return;
        const line = bresenham(d.last.x, d.last.y, p.x, p.y);
        const pts: Point[] = [];
        for (const lp of line) pts.push(...brushPoints(lp.x, lp.y, brushSize));
        s.paintPoints(mirrorPoints(pts, mirror, width, height), d.mode);
        setDragBoth({ ...d, last: p });
        break;
      }
      case "shape":
      case "select":
        if (d.current.x !== p.x || d.current.y !== p.y) setDragBoth({ ...d, current: p });
        break;
      case "move":
        s.setFloatingOffset(p.x - d.start.x, p.y - d.start.y);
        break;
      case "pan": {
        const stage = getStage(e.currentTarget);
        if (stage) {
          stage.scrollLeft = d.scrollLeft - (e.clientX - d.startX);
          stage.scrollTop = d.scrollTop - (e.clientY - d.startY);
        }
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    const s = useEditorStore.getState();
    if (d && s.doc) {
      const { width, height } = s.doc;
      if (d.kind === "shape") {
        const pts = shapePoints(tool, d.start, d.current, brushSize, mirror, width, height);
        s.paintPoints(pts, e.button === 2 ? "erase" : "color");
      } else if (d.kind === "select") {
        const sel = rectSelection(d.start.x, d.start.y, d.current.x, d.current.y, width, height);
        const isClick = d.start.x === d.current.x && d.start.y === d.current.y;
        s.setSelection(isClick ? null : sel);
      }
    }
    setDragBoth(null);
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const s = useEditorStore.getState();
    s.setZoom(e.deltaY < 0 ? Math.min(64, zoom + 2) : Math.max(1, zoom - 2));
  };

  if (!doc) return null;

  const cursor = spaceHeld ? "grab" : drag?.kind === "pan" ? "grabbing" : TOOL_CURSORS[tool] ?? "crosshair";

  return (
    <canvas
      ref={canvasRef}
      className="editor-canvas"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDragBoth(null)}
      onPointerLeave={() => setHover(null)}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={onWheel}
    />
  );
}

function shapePoints(tool: string, a: Point, b: Point, brush: number, mirror: "off" | "horizontal" | "vertical" | "both", w: number, h: number): Point[] {
  let base: Point[];
  if (tool === "line") base = bresenham(a.x, a.y, b.x, b.y);
  else if (tool === "rect") base = rectOutline(a.x, a.y, b.x, b.y);
  else base = ellipseOutline(a.x, a.y, b.x, b.y);
  const pts: Point[] = [];
  for (const p of base) pts.push(...brushPoints(p.x, p.y, brush));
  return mirrorPoints(pts, mirror, w, h);
}
