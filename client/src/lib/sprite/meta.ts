import type { PixelDocument } from "@/types/editor";
import type { SpriteMeta, SpriteStatus, SpriteSummary } from "@/types/sprite";
import { hashPixels, type PixelImage } from "./quality";
import { deriveDna } from "./dna";

export const STATUS_LABEL: Record<SpriteStatus, string> = { draft: "Draft", reviewed: "Reviewed", approved: "Approved" };
export const STATUS_ORDER: SpriteStatus[] = ["draft", "reviewed", "approved"];

/** Flatten the visible layers of a frame (topmost non-empty pixel wins; layer opacity ignored). */
export function flattenFrame(doc: PixelDocument, frameIndex = 0): PixelImage {
  const frame = doc.frames[frameIndex];
  const out: string[] = Array(doc.width * doc.height).fill("");
  if (frame) {
    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      const cel = frame.cels[layer.id];
      if (!cel) continue;
      for (let i = 0; i < cel.length; i++) if (cel[i]) out[i] = cel[i];
    }
  }
  return { width: doc.width, height: doc.height, pixels: out };
}

export function currentHash(doc: PixelDocument): string {
  return hashPixels(flattenFrame(doc).pixels);
}

export function isEditedAfterApproval(doc: PixelDocument): boolean {
  const s = doc.sprite;
  return !!(s && s.status === "approved" && s.approvedHash && s.approvedHash !== currentHash(doc));
}

export function toSpriteSummary(doc: PixelDocument): SpriteSummary | undefined {
  const s = doc.sprite;
  if (!s) return undefined;
  return {
    kind: s.kind,
    characterId: s.characterId,
    masterId: s.masterId,
    outfit: s.outfit,
    status: s.status,
    version: s.version,
    presetId: s.presetId,
    editedAfterApproval: isEditedAfterApproval(doc),
  };
}

/** Returns an updated copy with a new status + history entry. Approval records a pixel hash and (for masters) locks the palette. */
export function withStatus(doc: PixelDocument, status: SpriteStatus, note?: string): PixelDocument {
  if (!doc.sprite) return doc;
  const now = Date.now();
  const flat = flattenFrame(doc);
  const sprite: SpriteMeta = {
    ...doc.sprite,
    status,
    history: [...doc.sprite.history, { at: now, action: `status:${status}`, note }],
  };
  if (status === "approved") {
    sprite.approvedHash = hashPixels(flat.pixels);
    sprite.approvedAt = now;
    if (sprite.kind === "master") {
      sprite.lockedPalette = Array.from(new Set(flat.pixels.filter(Boolean)));
      // refresh DNA numbers from the approved pixels, keep the user's traits text
      sprite.dna = deriveDna(flat, sprite.dna?.traits ?? "", sprite.dna?.notes ?? "");
    }
  } else {
    sprite.approvedHash = null;
    sprite.approvedAt = null;
  }
  return { ...doc, sprite, updatedAt: now };
}

export function sanitizeId(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function spriteAssetId(doc: PixelDocument): string {
  const s = doc.sprite;
  if (!s) return sanitizeId(doc.name) || doc.id;
  return s.kind === "master" ? `${s.characterId}_${sanitizeId(s.outfit) || "BASE"}` : `${s.characterId}_${sanitizeId(s.outfit) || "VARIANT"}`;
}

export interface SpriteManifest {
  id: string;
  documentId: string;
  name: string;
  kind: SpriteMeta["kind"];
  characterId: string;
  masterId: string | null;
  masterAssetId: string | null;
  outfit: string;
  presetId: string;
  presetVersion: number;
  canvas: { width: number; height: number };
  view: string;
  pose: string;
  footAnchor: { x: number; y: number };
  /** Unity pivot (normalized, origin bottom-left) matching footAnchor */
  unityPivot: { x: number; y: number };
  pixelsPerUnit: number | null;
  paletteId: string | null;
  colors: number;
  status: SpriteMeta["status"];
  editedAfterApproval: boolean;
  sourceAssetId: string | null;
  processedAssetId: string;
  file: string;
  generation: { provider: string | null; model: string | null; prompt: string; seed: number | null; referenceUsed: boolean; maskUsed: boolean } | null;
  version: number;
  exportedAt: string;
  generator: string;
}

/** JSON manifest (schema from the spec, section 5, plus Unity pivot). */
export function buildManifest(doc: PixelDocument, opts: { file: string; masterAssetId?: string | null; pixelsPerUnit?: number | null }): SpriteManifest {
  const s = doc.sprite;
  const flat = flattenFrame(doc);
  const anchor = s?.footAnchor ?? { x: Math.floor(doc.width / 2), y: doc.height - 1 };
  return {
    id: spriteAssetId(doc),
    documentId: doc.id,
    name: doc.name,
    kind: s?.kind ?? "master",
    characterId: s?.characterId ?? spriteAssetId(doc),
    masterId: s?.masterId ?? null,
    masterAssetId: opts.masterAssetId ?? null,
    outfit: s?.outfit ?? "",
    presetId: s?.presetId ?? "",
    presetVersion: s?.presetVersion ?? 0,
    canvas: { width: doc.width, height: doc.height },
    view: s?.view ?? "",
    pose: s?.pose ?? "",
    footAnchor: anchor,
    // feet sit on the bottom edge of the anchor pixel; Unity's pivot origin is bottom-left
    unityPivot: { x: +(anchor.x / doc.width).toFixed(5), y: +((doc.height - 1 - anchor.y) / doc.height).toFixed(5) },
    pixelsPerUnit: opts.pixelsPerUnit ?? null,
    paletteId: s?.paletteId ?? null,
    colors: new Set(flat.pixels.filter(Boolean)).size,
    status: s?.status ?? "draft",
    editedAfterApproval: isEditedAfterApproval(doc),
    sourceAssetId: s?.sourceAssetId ?? null,
    processedAssetId: doc.id,
    file: opts.file,
    generation: s?.generation
      ? {
        provider: s.generation.provider,
        model: s.generation.model,
        prompt: s.generation.prompt,
        seed: s.generation.seed ?? null,
        referenceUsed: s.generation.referenceUsed,
        maskUsed: s.generation.maskUsed,
      }
      : null,
    version: s?.version ?? 1,
    exportedAt: new Date().toISOString(),
    generator: "PixelForge Studio - Sprite Forge",
  };
}
