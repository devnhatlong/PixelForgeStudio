"use client";

import { API_BASE } from "@/lib/api";
import { uid } from "@/lib/document";
import { getAssetLocal, markAssetRemote, putAsset, type AssetKind, type StoredAsset } from "@/lib/storage";
import { useAuthStore } from "@/store/auth-store";
import type { RgbaImage } from "@/lib/png-to-pixel";

const token = () => useAuthStore.getState().token;

export function rgbaToCanvas(img: RgbaImage): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}

export function canvasToPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Không mã hóa được PNG"))), "image/png"));
}

export const rgbaToPng = (img: RgbaImage) => canvasToPng(rgbaToCanvas(img));

export function blobToRgba(blob: Blob): Promise<RgbaImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh"));
    };
    img.src = url;
  });
}

export function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function upload(asset: StoredAsset): Promise<void> {
  const t = token();
  if (!t) return;
  const form = new FormData();
  form.append("id", asset.id);
  form.append("file", asset.blob, `${asset.id}.png`);
  const res = await fetch(`${API_BASE}/assets`, { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: form });
  if (!res.ok) throw new Error(`Upload asset lỗi ${res.status}`);
  await markAssetRemote(asset.id);
}

/**
 * Store an immutable asset locally (IndexedDB) and, when logged in, on the server (server/storage).
 * The upload is best-effort: a failure leaves the local copy, retried by ensureAssetsUploaded().
 */
export async function saveAsset(blob: Blob, kind: AssetKind, size: { width: number; height: number }): Promise<string> {
  const prefix = kind === "source" ? "src_" : kind === "cleaned" ? "cln_" : kind === "mask" ? "msk_" : "ref_";
  const asset: StoredAsset = { id: uid(prefix), kind, mime: blob.type || "image/png", width: size.width, height: size.height, blob, createdAt: Date.now() };
  await putAsset(asset);
  upload(asset).catch(() => {});
  return asset.id;
}

export async function ensureAssetsUploaded(ids: (string | null | undefined)[]): Promise<void> {
  if (!token()) return;
  for (const id of ids) {
    if (!id) continue;
    const a = await getAssetLocal(id);
    if (a && !a.remote) await upload(a).catch(() => {});
  }
}

/** Local first, then the server copy (cached locally afterwards). */
export async function getAssetBlob(id: string | null | undefined): Promise<Blob | null> {
  if (!id) return null;
  const local = await getAssetLocal(id).catch(() => undefined);
  if (local) return local.blob;
  const t = token();
  if (!t) return null;
  const res = await fetch(`${API_BASE}/assets/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${t}` } }).catch(() => null);
  if (!res || !res.ok) return null;
  const blob = await res.blob();
  const rgba = await blobToRgba(blob).catch(() => null);
  await putAsset({ id, kind: "source", mime: blob.type, width: rgba?.width ?? 0, height: rgba?.height ?? 0, blob, createdAt: Date.now(), remote: true }).catch(() => {});
  return blob;
}

/**
 * Downscale an image to fit maxSide (keeps aspect) and re-encode as PNG.
 * Used for style-example uploads: smaller input images = fewer input tokens (cheaper) and faster uploads.
 */
export async function shrinkToPng(blob: Blob, maxSide = 1024): Promise<{ blob: Blob; width: number; height: number }> {
  const src = await blobToRgba(blob);
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k));
  const h = Math.max(1, Math.round(src.height * k));
  const full = rgbaToCanvas(src);
  if (k === 1 && blob.type === "image/png") return { blob, width: w, height: h };
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, 0, 0, w, h);
  return { blob: await canvasToPng(c), width: w, height: h };
}
