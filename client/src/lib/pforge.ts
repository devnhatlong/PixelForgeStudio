import type { PixelDocument } from "@/types/editor";
import { normalizeDocument, uid } from "./document";

const MAGIC = "PFORGE";
const VERSION = 1;

interface PforgeFile {
  magic: string;
  version: number;
  document: PixelDocument;
}

export function serializePforge(doc: PixelDocument): string {
  const file: PforgeFile = { magic: MAGIC, version: VERSION, document: doc };
  return JSON.stringify(file);
}

export function parsePforge(text: string, opts?: { newId?: boolean }): PixelDocument {
  const parsed = JSON.parse(text) as Partial<PforgeFile>;
  if (parsed.magic !== MAGIC || !parsed.document) throw new Error("File không phải định dạng .pforge hợp lệ");
  const doc = normalizeDocument(parsed.document);
  if (opts?.newId) doc.id = uid("d");
  return doc;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadPforge(doc: PixelDocument) {
  const blob = new Blob([serializePforge(doc)], { type: "application/json" });
  downloadBlob(blob, `${safeName(doc.name)}.pforge`);
}

export function safeName(name: string) {
  return (name || "sprite").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);
}
