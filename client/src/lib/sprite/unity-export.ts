import type { PixelDocument } from "@/types/editor";
import type { AnimationTag } from "@/types/sprite";
import { safeName } from "@/lib/pforge";

/**
 * Unity export: one atlas PNG + one JSON (JsonUtility-friendly: arrays only, no dictionaries) that the
 * PixelForgeImporter editor script turns into sliced sprites (custom pivots) and .anim clips.
 */

export interface UnityFrame {
  name: string;
  index: number;
  /** rect in atlas pixels, Unity convention: origin bottom-left */
  x: number;
  y: number;
  w: number;
  h: number;
  /** normalized pivot (feet anchor), origin bottom-left */
  pivotX: number;
  pivotY: number;
  durationMs: number;
}

export interface UnityClip {
  name: string;
  state: string;
  fps: number;
  loop: boolean;
  frames: string[];
  /** reserved: animation events (frame index → function name) */
  events: { frame: number; functionName: string; stringParameter: string }[];
}

export interface UnityAnimJson {
  format: "pixelforge-unity";
  version: 1;
  name: string;
  texture: string;
  pixelsPerUnit: number;
  atlasWidth: number;
  atlasHeight: number;
  frameWidth: number;
  frameHeight: number;
  frames: UnityFrame[];
  clips: UnityClip[];
  /** reserved for weapon / VFX attachment points (P1) */
  attachments: { frame: number; name: string; x: number; y: number }[];
  /** reserved for hit / hurt boxes (P1) */
  hitboxes: { frame: number; kind: string; x: number; y: number; w: number; h: number }[];
}

export interface AtlasLayout {
  cols: number;
  rows: number;
  width: number;
  height: number;
  /** top-left positions (canvas coordinates) */
  cells: { x: number; y: number }[];
}

/** Grid atlas with `padding` px around every frame (prevents bleeding with Point filtering / mip maps off). */
export function atlasLayout(count: number, fw: number, fh: number, padding = 2, maxWidth = 4096): AtlasLayout {
  const cellW = fw + padding * 2;
  const cellH = fh + padding * 2;
  const cols = Math.max(1, Math.min(count, Math.floor(maxWidth / cellW)));
  const rows = Math.ceil(count / cols);
  const cells = Array.from({ length: count }, (_, i) => ({ x: (i % cols) * cellW + padding, y: Math.floor(i / cols) * cellH + padding }));
  return { cols, rows, width: cols * cellW, height: rows * cellH, cells };
}

export function clipsFor(doc: PixelDocument, tags: AnimationTag[]): { name: string; state: string; fps: number; loop: boolean; from: number; to: number }[] {
  if (tags.length) return tags.map((t) => ({ name: t.name, state: t.state, fps: t.fps, loop: t.loop, from: t.from, to: t.to }));
  const avg = doc.frames.reduce((s, f) => s + f.duration, 0) / doc.frames.length || 100;
  return [{ name: "Default", state: "custom", fps: Math.max(1, Math.round(1000 / avg)), loop: true, from: 0, to: doc.frames.length - 1 }];
}

export function buildUnityJson(doc: PixelDocument, opts: { tags: AnimationTag[]; anchor: { x: number; y: number }; pixelsPerUnit: number; padding?: number }): { json: UnityAnimJson; layout: AtlasLayout } {
  const base = safeName(doc.name) || "sprite";
  const layout = atlasLayout(doc.frames.length, doc.width, doc.height, opts.padding ?? 2);
  const frameName = (i: number) => `${base}_${i}`;
  const frames: UnityFrame[] = doc.frames.map((f, i) => {
    const c = layout.cells[i];
    return {
      name: frameName(i),
      index: i,
      x: c.x,
      y: layout.height - c.y - doc.height,
      w: doc.width,
      h: doc.height,
      // feet sit on the bottom edge of the anchor row
      pivotX: +(opts.anchor.x / doc.width).toFixed(5),
      pivotY: +((doc.height - 1 - opts.anchor.y) / doc.height).toFixed(5),
      durationMs: f.duration,
    };
  });
  const clips: UnityClip[] = clipsFor(doc, opts.tags).map((c) => ({
    name: c.name,
    state: c.state,
    fps: c.fps,
    loop: c.loop,
    frames: Array.from({ length: c.to - c.from + 1 }, (_, k) => frameName(c.from + k)),
    events: [],
  }));
  return {
    layout,
    json: {
      format: "pixelforge-unity",
      version: 1,
      name: base,
      texture: `${base}.png`,
      pixelsPerUnit: opts.pixelsPerUnit,
      atlasWidth: layout.width,
      atlasHeight: layout.height,
      frameWidth: doc.width,
      frameHeight: doc.height,
      frames,
      clips,
      attachments: [],
      hitboxes: [],
    },
  };
}

/* ---------------- browser packaging ---------------- */

const README = (j: UnityAnimJson) => `PixelForge → Unity
==================
1. Copy Editor/PixelForgeImporter.cs into your Unity project (any "Editor" folder, once).
2. Copy ${j.texture} and ${j.name}.pfanim.json into the same folder under Assets/.
3. The importer runs automatically (or: select the .pfanim.json → Tools ▸ PixelForge ▸ Import Selected).
   Result: ${j.frames.length} sliced sprites (Point filter, no compression, PPU ${j.pixelsPerUnit}, feet pivot),
   ${j.clips.length} .anim clip(s): ${j.clips.map((c) => `${c.name} (${c.fps} fps${c.loop ? ", loop" : ""})`).join(", ")},
   and ${j.name}.controller with one state per clip.
4. Add a SpriteRenderer + Animator to your character and assign ${j.name}.controller.

Frame size ${j.frameWidth}×${j.frameHeight}px. Pivot = feet anchor, so every clip stands on the same ground point.
`;

/** atlas PNG + .pfanim.json + importer script + README, zipped. */
export async function exportUnityPackage(doc: PixelDocument, opts: { tags: AnimationTag[]; anchor: { x: number; y: number }; pixelsPerUnit: number }): Promise<{ zip: Blob; json: UnityAnimJson; atlas: HTMLCanvasElement }> {
  const [{ default: JSZip }, { renderFrameToCanvas }] = await Promise.all([import("jszip"), import("@/lib/raster")]);
  const { json, layout } = buildUnityJson(doc, opts);
  const atlas = document.createElement("canvas");
  atlas.width = layout.width;
  atlas.height = layout.height;
  const ctx = atlas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  doc.frames.forEach((f, i) => ctx.drawImage(renderFrameToCanvas(doc, f, 1, "transparent"), layout.cells[i].x, layout.cells[i].y));
  const png = await new Promise<Blob>((res, rej) => atlas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
  const zip = new JSZip();
  zip.file(json.texture, png);
  zip.file(`${json.name}.pfanim.json`, JSON.stringify(json, null, 2));
  zip.file("README_UNITY.txt", README(json));
  const cs = await fetch("/unity/PixelForgeImporter.cs").then((r) => (r.ok ? r.text() : null)).catch(() => null);
  if (cs) zip.file("Editor/PixelForgeImporter.cs", cs);
  return { zip: await zip.generateAsync({ type: "blob" }), json, atlas };
}
