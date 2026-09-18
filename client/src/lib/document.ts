import type { Frame, LayerMeta, PixelDocument } from "@/types/editor";
import { emptyPixels } from "./raster";

export function uid(prefix = ""): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${rnd}`;
}

export function createLayer(name: string): LayerMeta {
  return { id: uid("l"), name, visible: true, locked: false, opacity: 1 };
}

export function createFrame(doc: Pick<PixelDocument, "width" | "height" | "layers">, duration = 100): Frame {
  const cels: Record<string, string[]> = {};
  for (const l of doc.layers) cels[l.id] = emptyPixels(doc.width, doc.height);
  return { id: uid("f"), duration, cels };
}

export function createDocument(name: string, width: number, height: number): PixelDocument {
  const layer = createLayer("Layer 1");
  const base = { width, height, layers: [layer] };
  const now = Date.now();
  return {
    id: uid("d"),
    name,
    width,
    height,
    layers: [layer],
    frames: [createFrame(base, 100)],
    palette: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneDocument(doc: PixelDocument): PixelDocument {
  return {
    ...doc,
    layers: doc.layers.map((l) => ({ ...l })),
    frames: doc.frames.map((f) => ({
      ...f,
      cels: Object.fromEntries(Object.entries(f.cels).map(([k, v]) => [k, v.slice()])),
    })),
    palette: doc.palette.slice(),
  };
}

/** Ensure every frame has a cel for every layer (repairs older files). */
export function normalizeDocument(doc: PixelDocument): PixelDocument {
  for (const f of doc.frames) {
    for (const l of doc.layers) {
      if (!f.cels[l.id] || f.cels[l.id].length !== doc.width * doc.height) {
        f.cels[l.id] = emptyPixels(doc.width, doc.height);
      }
    }
  }
  if (!doc.palette) doc.palette = [];
  return doc;
}
