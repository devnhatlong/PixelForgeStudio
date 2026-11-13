"use client";

import JSZip from "jszip";
import type { PixelDocument } from "@/types/editor";
import { exportPng } from "@/lib/export";
import { buildManifest, spriteAssetId, type SpriteManifest } from "./meta";

export interface SpriteExportOptions {
  /** 1 = real pixel size (recommended for Unity, use Filter Mode = Point) */
  scale: number;
  pixelsPerUnit?: number | null;
}

/** One transparent PNG per sprite (frame 1, never a checkerboard) + its JSON manifest. */
export async function exportSpriteFiles(doc: PixelDocument, opts: SpriteExportOptions, masterDoc?: PixelDocument | null) {
  const id = spriteAssetId(doc);
  const file = `${id}.png`;
  const png = await exportPng(doc, 0, opts.scale, "transparent");
  const manifest = buildManifest(doc, { file, masterAssetId: masterDoc ? spriteAssetId(masterDoc) : null, pixelsPerUnit: opts.pixelsPerUnit });
  if (opts.scale !== 1) {
    manifest.canvas = { width: doc.width * opts.scale, height: doc.height * opts.scale };
    manifest.footAnchor = { x: manifest.footAnchor.x * opts.scale, y: manifest.footAnchor.y * opts.scale + opts.scale - 1 };
  }
  return { id, png, manifest };
}

/** ZIP with <ID>.png + <ID>.json per sprite and an index manifest.json for the whole batch. */
export async function exportSpritesZip(docs: PixelDocument[], opts: SpriteExportOptions, allDocs: PixelDocument[] = docs): Promise<Blob> {
  const zip = new JSZip();
  const byId = new Map(allDocs.map((d) => [d.id, d]));
  const index: SpriteManifest[] = [];
  for (const doc of docs) {
    const master = doc.sprite?.masterId ? byId.get(doc.sprite.masterId) ?? null : null;
    const { id, png, manifest } = await exportSpriteFiles(doc, opts, master);
    zip.file(`${id}.png`, png);
    zip.file(`${id}.json`, JSON.stringify(manifest, null, 2));
    index.push(manifest);
  }
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        generator: "PixelForge Studio - Sprite Forge",
        exportedAt: new Date().toISOString(),
        unityImport: { textureType: "Sprite (2D and UI)", filterMode: "Point (no filter)", compression: "None", pivot: "Custom - dùng unityPivot trong từng file JSON" },
        sprites: index,
      },
      null,
      2,
    ),
  );
  return zip.generateAsync({ type: "blob" });
}
