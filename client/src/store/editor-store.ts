import { create } from "zustand";
import type { EditorTool, FloatingBuffer, Frame, MirrorMode, PixelDocument, Selection } from "@/types/editor";
import { createFrame, createLayer, uid } from "@/lib/document";
import { emptyPixels, type Point } from "@/lib/raster";
import { shade } from "@/lib/color";

export type PaintMode = "color" | "erase" | "lighten" | "darken" | "dither";

const HISTORY_LIMIT = 80;

type EditorState = {
  doc: PixelDocument | null;
  frameIndex: number;
  layerId: string;
  tool: EditorTool;
  primary: string;
  secondary: string;
  brushSize: number;
  mirror: MirrorMode;
  zoom: number;
  showGrid: boolean;
  /** major grid cell size in pixels; 0 = off. Ignored when gridAuto is on. */
  gridSize: number;
  /** derive major grid size from canvas size (max(w,h)/8) */
  gridAuto: boolean;
  /** 0..1 opacity of the grid overlay */
  gridOpacity: number;
  onionSkin: boolean;
  playing: boolean;
  fps: number;
  selection: Selection | null;
  floating: FloatingBuffer | null;
  recentColors: string[];
  paletteId: string;
  history: PixelDocument[];
  future: PixelDocument[];
  dirty: boolean;

  loadDocument: (doc: PixelDocument) => void;
  closeDocument: () => void;
  renameDocument: (name: string) => void;
  markSaved: () => void;

  setTool: (tool: EditorTool) => void;
  setPrimary: (color: string) => void;
  setSecondary: (color: string) => void;
  swapColors: () => void;
  setBrushSize: (n: number) => void;
  setMirror: (m: MirrorMode) => void;
  setZoom: (z: number) => void;
  toggleGrid: () => void;
  setGridSize: (n: number) => void;
  setGridAuto: (b: boolean) => void;
  setGridOpacity: (n: number) => void;
  toggleOnionSkin: () => void;
  setPlaying: (p: boolean) => void;
  setFps: (fps: number) => void;
  setPaletteId: (id: string) => void;
  addPaletteColor: (color: string) => void;
  removePaletteColor: (color: string) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  paintPoints: (points: Point[], mode: PaintMode) => void;
  fillIndices: (indices: number[], color: string | null) => void;
  clearLayer: () => void;

  setFrameIndex: (i: number) => void;
  addFrame: () => void;
  duplicateFrame: (i?: number) => void;
  deleteFrame: (i?: number) => void;
  moveFrame: (from: number, to: number) => void;
  setFrameDuration: (i: number, ms: number) => void;
  setAllDurations: (ms: number) => void;

  setLayerId: (id: string) => void;
  addLayer: () => void;
  duplicateLayer: (id?: string) => void;
  deleteLayer: (id?: string) => void;
  moveLayer: (id: string, dir: -1 | 1) => void;
  updateLayer: (id: string, patch: Partial<{ name: string; visible: boolean; locked: boolean; opacity: number }>) => void;
  mergeLayerDown: (id: string) => void;

  setSelection: (sel: Selection | null) => void;
  selectAll: () => void;
  deleteSelection: () => void;
  liftFloating: () => void;
  setFloatingOffset: (dx: number, dy: number) => void;
  commitFloating: () => void;
  cancelFloating: () => void;
  flipLayer: (axis: "h" | "v") => void;
};

function currentLayer(state: EditorState) {
  return state.doc?.layers.find((l) => l.id === state.layerId);
}

function replaceCel(doc: PixelDocument, frameIndex: number, layerId: string, pixels: string[]): PixelDocument {
  const frames = doc.frames.slice();
  const frame = frames[frameIndex];
  frames[frameIndex] = { ...frame, cels: { ...frame.cels, [layerId]: pixels } };
  return { ...doc, frames, updatedAt: Date.now() };
}

function withHistory(state: EditorState, doc: PixelDocument): Partial<EditorState> {
  const history = [...state.history, state.doc!].slice(-HISTORY_LIMIT);
  return { doc, history, future: [], dirty: true };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  doc: null,
  frameIndex: 0,
  layerId: "",
  tool: "pencil",
  primary: "#d97724",
  secondary: "#ffffff",
  brushSize: 1,
  mirror: "off",
  zoom: 16,
  showGrid: true,
  gridSize: 0,
  gridAuto: false,
  gridOpacity: 0.6,
  onionSkin: false,
  playing: false,
  fps: 8,
  selection: null,
  floating: null,
  recentColors: [],
  paletteId: "cat-warm",
  history: [],
  future: [],
  dirty: false,

  loadDocument: (doc) =>
    set({
      doc,
      frameIndex: 0,
      layerId: doc.layers[0]?.id ?? "",
      history: [],
      future: [],
      selection: null,
      floating: null,
      playing: false,
      dirty: false,
      zoom: Math.max(4, Math.min(28, Math.floor(560 / Math.max(doc.width, doc.height)))),
    }),
  closeDocument: () => set({ doc: null, history: [], future: [], selection: null, floating: null, playing: false }),
  renameDocument: (name) => set((s) => (s.doc ? { doc: { ...s.doc, name, updatedAt: Date.now() }, dirty: true } : s)),
  markSaved: () => set({ dirty: false }),

  setTool: (tool) => {
    const s = get();
    if (s.floating && tool !== "move") s.commitFloating();
    set({ tool });
  },
  setPrimary: (color) =>
    set((s) => ({
      primary: color,
      recentColors: [color, ...s.recentColors.filter((c) => c !== color)].slice(0, 16),
    })),
  setSecondary: (color) => set({ secondary: color }),
  swapColors: () => set((s) => ({ primary: s.secondary, secondary: s.primary })),
  setBrushSize: (n) => set({ brushSize: Math.max(1, Math.min(4, n)) }),
  setMirror: (m) => set({ mirror: m }),
  setZoom: (z) => set({ zoom: Math.max(1, Math.min(64, z)) }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setGridSize: (n) => set({ gridSize: Math.max(0, Math.min(64, Math.round(n))), gridAuto: false }),
  setGridAuto: (b) => set({ gridAuto: b }),
  setGridOpacity: (n) => set({ gridOpacity: Math.max(0.1, Math.min(1, n)) }),
  toggleOnionSkin: () => set((s) => ({ onionSkin: !s.onionSkin })),
  setPlaying: (p) => set({ playing: p }),
  setFps: (fps) => set({ fps: Math.max(1, Math.min(60, fps)) }),
  setPaletteId: (id) => set({ paletteId: id }),
  addPaletteColor: (color) =>
    set((s) => {
      if (!s.doc || s.doc.palette.includes(color)) return s;
      return { doc: { ...s.doc, palette: [...s.doc.palette, color] }, dirty: true };
    }),
  removePaletteColor: (color) =>
    set((s) => (s.doc ? { doc: { ...s.doc, palette: s.doc.palette.filter((c) => c !== color) }, dirty: true } : s)),

  pushHistory: () =>
    set((s) => (s.doc ? { history: [...s.history, s.doc].slice(-HISTORY_LIMIT), future: [] } : s)),
  undo: () =>
    set((s) => {
      if (!s.history.length || !s.doc) return s;
      const prev = s.history[s.history.length - 1];
      const fi = Math.min(s.frameIndex, prev.frames.length - 1);
      const layerId = prev.layers.some((l) => l.id === s.layerId) ? s.layerId : prev.layers[0].id;
      return { doc: prev, history: s.history.slice(0, -1), future: [s.doc, ...s.future], frameIndex: fi, layerId, floating: null, dirty: true };
    }),
  redo: () =>
    set((s) => {
      if (!s.future.length || !s.doc) return s;
      const next = s.future[0];
      const fi = Math.min(s.frameIndex, next.frames.length - 1);
      const layerId = next.layers.some((l) => l.id === s.layerId) ? s.layerId : next.layers[0].id;
      return { doc: next, future: s.future.slice(1), history: [...s.history, s.doc], frameIndex: fi, layerId, floating: null, dirty: true };
    }),

  paintPoints: (points, mode) =>
    set((s) => {
      const doc = s.doc;
      const layer = currentLayer(s);
      if (!doc || !layer || layer.locked) return s;
      const { width, height } = doc;
      const frame = doc.frames[s.frameIndex];
      const src = frame.cels[layer.id];
      const px = src.slice();
      const mask = s.selection?.mask;
      let changed = false;
      for (const p of points) {
        if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) continue;
        const i = p.y * width + p.x;
        if (mask && !mask[i]) continue;
        let next = px[i];
        switch (mode) {
          case "color":
            next = s.primary;
            break;
          case "erase":
            next = "";
            break;
          case "dither":
            next = (p.x + p.y) % 2 === 0 ? s.primary : px[i];
            break;
          case "lighten":
            if (px[i]) next = shade(px[i], 0.12);
            break;
          case "darken":
            if (px[i]) next = shade(px[i], -0.12);
            break;
        }
        if (next !== px[i]) {
          px[i] = next;
          changed = true;
        }
      }
      if (!changed) return s;
      return { doc: replaceCel(doc, s.frameIndex, layer.id, px), dirty: true };
    }),

  fillIndices: (indices, color) =>
    set((s) => {
      const doc = s.doc;
      const layer = currentLayer(s);
      if (!doc || !layer || layer.locked || !indices.length) return s;
      const px = doc.frames[s.frameIndex].cels[layer.id].slice();
      for (const i of indices) px[i] = color ?? "";
      return { doc: replaceCel(doc, s.frameIndex, layer.id, px), dirty: true };
    }),

  clearLayer: () =>
    set((s) => {
      const doc = s.doc;
      const layer = currentLayer(s);
      if (!doc || !layer || layer.locked) return s;
      return withHistory(s, replaceCel(doc, s.frameIndex, layer.id, emptyPixels(doc.width, doc.height)));
    }),

  setFrameIndex: (i) =>
    set((s) => {
      if (!s.doc) return s;
      if (s.floating) get().commitFloating();
      return { frameIndex: Math.max(0, Math.min(s.doc.frames.length - 1, i)) };
    }),
  addFrame: () =>
    set((s) => {
      if (!s.doc) return s;
      const last = s.doc.frames[s.doc.frames.length - 1];
      const frame = createFrame(s.doc, last?.duration ?? Math.round(1000 / s.fps));
      const frames = [...s.doc.frames.slice(0, s.frameIndex + 1), frame, ...s.doc.frames.slice(s.frameIndex + 1)];
      return { ...withHistory(s, { ...s.doc, frames }), frameIndex: s.frameIndex + 1 };
    }),
  duplicateFrame: (i) =>
    set((s) => {
      if (!s.doc) return s;
      const idx = i ?? s.frameIndex;
      const src = s.doc.frames[idx];
      const copy: Frame = {
        id: uid("f"),
        duration: src.duration,
        cels: Object.fromEntries(Object.entries(src.cels).map(([k, v]) => [k, v.slice()])),
      };
      const frames = [...s.doc.frames.slice(0, idx + 1), copy, ...s.doc.frames.slice(idx + 1)];
      return { ...withHistory(s, { ...s.doc, frames }), frameIndex: idx + 1 };
    }),
  deleteFrame: (i) =>
    set((s) => {
      if (!s.doc || s.doc.frames.length <= 1) return s;
      const idx = i ?? s.frameIndex;
      const frames = s.doc.frames.filter((_, k) => k !== idx);
      return { ...withHistory(s, { ...s.doc, frames }), frameIndex: Math.min(idx, frames.length - 1) };
    }),
  moveFrame: (from, to) =>
    set((s) => {
      if (!s.doc || from === to) return s;
      const frames = s.doc.frames.slice();
      const [f] = frames.splice(from, 1);
      frames.splice(to, 0, f);
      return { ...withHistory(s, { ...s.doc, frames }), frameIndex: to };
    }),
  setFrameDuration: (i, ms) =>
    set((s) => {
      if (!s.doc) return s;
      const frames = s.doc.frames.slice();
      frames[i] = { ...frames[i], duration: Math.max(10, Math.min(5000, Math.round(ms))) };
      return { doc: { ...s.doc, frames, updatedAt: Date.now() }, dirty: true };
    }),
  setAllDurations: (ms) =>
    set((s) => {
      if (!s.doc) return s;
      const d = Math.max(10, Math.min(5000, Math.round(ms)));
      return { doc: { ...s.doc, frames: s.doc.frames.map((f) => ({ ...f, duration: d })), updatedAt: Date.now() }, dirty: true };
    }),

  setLayerId: (id) => {
    if (get().floating) get().commitFloating();
    set({ layerId: id });
  },
  addLayer: () =>
    set((s) => {
      if (!s.doc) return s;
      const layer = createLayer(`Layer ${s.doc.layers.length + 1}`);
      const idx = s.doc.layers.findIndex((l) => l.id === s.layerId);
      const layers = s.doc.layers.slice();
      layers.splice(idx + 1, 0, layer);
      const frames = s.doc.frames.map((f) => ({ ...f, cels: { ...f.cels, [layer.id]: emptyPixels(s.doc!.width, s.doc!.height) } }));
      return { ...withHistory(s, { ...s.doc, layers, frames }), layerId: layer.id };
    }),
  duplicateLayer: (id) =>
    set((s) => {
      if (!s.doc) return s;
      const srcId = id ?? s.layerId;
      const idx = s.doc.layers.findIndex((l) => l.id === srcId);
      if (idx < 0) return s;
      const src = s.doc.layers[idx];
      const layer = { ...src, id: uid("l"), name: `${src.name} copy` };
      const layers = s.doc.layers.slice();
      layers.splice(idx + 1, 0, layer);
      const frames = s.doc.frames.map((f) => ({ ...f, cels: { ...f.cels, [layer.id]: f.cels[srcId].slice() } }));
      return { ...withHistory(s, { ...s.doc, layers, frames }), layerId: layer.id };
    }),
  deleteLayer: (id) =>
    set((s) => {
      if (!s.doc || s.doc.layers.length <= 1) return s;
      const target = id ?? s.layerId;
      const idx = s.doc.layers.findIndex((l) => l.id === target);
      const layers = s.doc.layers.filter((l) => l.id !== target);
      const frames = s.doc.frames.map((f) => {
        const cels = { ...f.cels };
        delete cels[target];
        return { ...f, cels };
      });
      const nextLayer = layers[Math.min(idx, layers.length - 1)];
      return { ...withHistory(s, { ...s.doc, layers, frames }), layerId: s.layerId === target ? nextLayer.id : s.layerId };
    }),
  moveLayer: (id, dir) =>
    set((s) => {
      if (!s.doc) return s;
      const idx = s.doc.layers.findIndex((l) => l.id === id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= s.doc.layers.length) return s;
      const layers = s.doc.layers.slice();
      [layers[idx], layers[to]] = [layers[to], layers[idx]];
      return withHistory(s, { ...s.doc, layers });
    }),
  updateLayer: (id, patch) =>
    set((s) => {
      if (!s.doc) return s;
      const layers = s.doc.layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
      return { doc: { ...s.doc, layers, updatedAt: Date.now() }, dirty: true };
    }),
  mergeLayerDown: (id) =>
    set((s) => {
      if (!s.doc) return s;
      const idx = s.doc.layers.findIndex((l) => l.id === id);
      if (idx <= 0) return s;
      const below = s.doc.layers[idx - 1];
      const frames = s.doc.frames.map((f) => {
        const top = f.cels[id];
        const merged = f.cels[below.id].slice();
        for (let i = 0; i < merged.length; i++) if (top[i]) merged[i] = top[i];
        const cels = { ...f.cels, [below.id]: merged };
        delete cels[id];
        return { ...f, cels };
      });
      const layers = s.doc.layers.filter((l) => l.id !== id);
      return { ...withHistory(s, { ...s.doc, layers, frames }), layerId: below.id };
    }),

  setSelection: (sel) => set({ selection: sel }),
  selectAll: () =>
    set((s) => {
      if (!s.doc) return s;
      const mask = new Uint8Array(s.doc.width * s.doc.height).fill(1);
      return { selection: { mask, x: 0, y: 0, w: s.doc.width, h: s.doc.height } };
    }),
  deleteSelection: () =>
    set((s) => {
      const doc = s.doc;
      const layer = currentLayer(s);
      if (!doc || !layer || layer.locked || !s.selection) return s;
      const px = doc.frames[s.frameIndex].cels[layer.id].slice();
      for (let i = 0; i < px.length; i++) if (s.selection.mask[i]) px[i] = "";
      return withHistory(s, replaceCel(doc, s.frameIndex, layer.id, px));
    }),
  liftFloating: () =>
    set((s) => {
      const doc = s.doc;
      const layer = currentLayer(s);
      if (!doc || !layer || layer.locked || s.floating) return s;
      const src = doc.frames[s.frameIndex].cels[layer.id];
      const mask = s.selection ? s.selection.mask : new Uint8Array(src.length).fill(1);
      const lifted = src.map((p, i) => (mask[i] ? p : ""));
      const remaining = src.map((p, i) => (mask[i] ? "" : p));
      return {
        ...withHistory(s, replaceCel(doc, s.frameIndex, layer.id, remaining)),
        floating: { pixels: lifted, mask, offsetX: 0, offsetY: 0 },
      };
    }),
  setFloatingOffset: (dx, dy) => set((s) => (s.floating ? { floating: { ...s.floating, offsetX: dx, offsetY: dy } } : s)),
  commitFloating: () =>
    set((s) => {
      const doc = s.doc;
      const layer = currentLayer(s);
      if (!doc || !layer || !s.floating) return { floating: null };
      const { width, height } = doc;
      const px = doc.frames[s.frameIndex].cels[layer.id].slice();
      const { pixels, offsetX, offsetY, mask } = s.floating;
      const newMask = new Uint8Array(width * height);
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          if (!mask[i]) continue;
          const nx = x + offsetX;
          const ny = y + offsetY;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (pixels[i]) px[ni] = pixels[i];
          newMask[ni] = 1;
          if (nx < minX) minX = nx;
          if (nx > maxX) maxX = nx;
          if (ny < minY) minY = ny;
          if (ny > maxY) maxY = ny;
        }
      }
      const selection: Selection | null =
        s.selection && maxX >= 0 ? { mask: newMask, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
      return { doc: replaceCel(doc, s.frameIndex, layer.id, px), floating: null, selection, dirty: true };
    }),
  cancelFloating: () =>
    set((s) => {
      if (!s.floating || !s.history.length) return { floating: null };
      const prev = s.history[s.history.length - 1];
      return { doc: prev, history: s.history.slice(0, -1), floating: null };
    }),
  flipLayer: (axis) =>
    set((s) => {
      const doc = s.doc;
      const layer = currentLayer(s);
      if (!doc || !layer || layer.locked) return s;
      const { width, height } = doc;
      const src = doc.frames[s.frameIndex].cels[layer.id];
      const px = src.slice();
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const sx = axis === "h" ? width - 1 - x : x;
          const sy = axis === "v" ? height - 1 - y : y;
          px[y * width + x] = src[sy * width + sx];
        }
      return withHistory(s, replaceCel(doc, s.frameIndex, layer.id, px));
    }),
}));
