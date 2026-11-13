import { create } from "zustand";
import type { PixelDocument } from "@/types/editor";
import type { AnimationTag } from "@/types/sprite";
import { HISTORY_LIMIT, useEditorStore } from "./editor-store";
import { flattenFrame } from "@/lib/sprite/meta";
import { footAlignment, shiftPixels, type FrameFootInfo } from "@/lib/sprite/align";
import { uid } from "@/lib/document";

export type GhostMode = "off" | "master" | "first";

/** Animation-studio UI state (guides, ghost, tag playback). Kept out of the main editor store. */
type AnimState = {
  showGuides: boolean;
  ghost: GhostMode;
  ghostOpacity: number;
  /** pixels of the ghost (master or frame 1), resolved by the Timeline */
  ghostPixels: string[] | null;
  /** play / highlight only this tag */
  activeTagId: string | null;
  toggleGuides: () => void;
  setGhost: (g: GhostMode) => void;
  setGhostOpacity: (n: number) => void;
  setGhostPixels: (p: string[] | null) => void;
  setActiveTag: (id: string | null) => void;
};

export const useAnimStore = create<AnimState>((set) => ({
  showGuides: true,
  ghost: "off",
  ghostOpacity: 0.3,
  ghostPixels: null,
  activeTagId: null,
  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
  setGhost: (ghost) => set({ ghost }),
  setGhostOpacity: (ghostOpacity) => set({ ghostOpacity }),
  setGhostPixels: (ghostPixels) => set({ ghostPixels }),
  setActiveTag: (activeTagId) => set({ activeTagId }),
}));

/** Feet / pivot of a document: sprite preset anchor, else the doc anchor, else bottom-centre. */
export function docAnchor(doc: PixelDocument): { x: number; y: number } {
  return doc.sprite?.footAnchor ?? doc.anchor ?? { x: Math.floor(doc.width / 2), y: doc.height - 1 };
}

/** Clamp tags to the current frame count (frames may have been deleted / moved). */
export function validTags(doc: PixelDocument): AnimationTag[] {
  const n = doc.frames.length;
  return (doc.animations ?? [])
    .map((t) => ({ ...t, from: Math.min(Math.max(0, t.from), n - 1), to: Math.min(Math.max(0, t.to), n - 1) }))
    .map((t) => (t.from > t.to ? { ...t, from: t.to, to: t.from } : t));
}

/** Apply a document change as one undoable step. */
function commit(fn: (doc: PixelDocument) => PixelDocument) {
  useEditorStore.setState((s) => {
    if (!s.doc) return s;
    const doc = { ...fn(s.doc), updatedAt: Date.now() };
    return { doc, history: [...s.history, s.doc].slice(-HISTORY_LIMIT), future: [], dirty: true };
  });
}

/**
 * Pivot lock: move every frame (all layers together) so its feet sit on the anchor.
 * Returns per-frame info (for reporting); pixels pushed outside the canvas are lost (warned by the caller).
 */
export function alignAllFrames(axes: "both" | "y"): FrameFootInfo[] {
  const doc = useEditorStore.getState().doc;
  if (!doc) return [];
  const anchor = docAnchor(doc);
  const infos = footAlignment(doc.frames.map((_, i) => flattenFrame(doc, i)), anchor, axes);
  if (infos.every((i) => !i.dx && !i.dy)) return infos;
  commit((d) => ({
    ...d,
    frames: d.frames.map((f, i) => {
      const { dx, dy } = infos[i];
      if (!dx && !dy) return f;
      return { ...f, cels: Object.fromEntries(Object.entries(f.cels).map(([lid, px]) => [lid, shiftPixels(px, d.width, d.height, dx, dy)])) };
    }),
  }));
  return infos;
}

export function setDocAnchor(anchor: { x: number; y: number }) {
  commit((d) => ({ ...d, anchor }));
}

export function upsertTag(tag: Omit<AnimationTag, "id"> & { id?: string }) {
  commit((d) => {
    const tags = d.animations ?? [];
    const next = tag.id ? tags.map((t) => (t.id === tag.id ? ({ ...t, ...tag } as AnimationTag) : t)) : [...tags, { ...tag, id: uid("tag") } as AnimationTag];
    return { ...d, animations: next.sort((a, b) => a.from - b.from) };
  });
}

export function deleteTag(id: string) {
  commit((d) => ({ ...d, animations: (d.animations ?? []).filter((t) => t.id !== id) }));
  if (useAnimStore.getState().activeTagId === id) useAnimStore.getState().setActiveTag(null);
}
