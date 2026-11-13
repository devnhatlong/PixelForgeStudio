/** Pure request validation for /ai/generate (unit-tested). */

import { IMAGE_QUALITIES, MODEL_ID_RE } from "./models";

export const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
/** Hard multer cap; the configurable limit (AI_MAX_UPLOAD_MB) is checked in validateGenerate. */
export const HARD_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
export const MAX_STYLE_REFS = 3;

export interface UploadedLike {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface GenerateBody {
  mode?: string;
  prompt?: string;
  negativePrompt?: string;
  count?: string | number;
  width?: string | number;
  height?: string | number;
  seed?: string | number | null;
  /** per-request override of OPENAI_IMAGE_MODEL */
  model?: string;
  /** per-request override of OPENAI_IMAGE_QUALITY */
  quality?: string;
}

export interface ValidatedGenerate {
  mode: "master" | "variant";
  prompt: string;
  negativePrompt: string;
  count: number;
  aspect: { width: number; height: number };
  seed: number | null;
  model: string | null;
  quality: string | null;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

/** Check the real file signature, not only the client-declared MIME type. */
export function sniffMime(buf: Buffer): string | null {
  if (PNG_MAGIC.every((b, i) => buf[i] === b)) return "image/png";
  if (JPEG_MAGIC.every((b, i) => buf[i] === b)) return "image/jpeg";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function validateFile(f: UploadedLike | undefined, label: string, maxBytes: number): string | null {
  if (!f) return null;
  if (f.size > maxBytes) return `${label}: dung lượng ${(f.size / 1048576).toFixed(1)}MB vượt giới hạn ${(maxBytes / 1048576).toFixed(0)}MB`;
  const real = sniffMime(f.buffer);
  if (!real || !(ALLOWED_MIME as readonly string[]).includes(f.mimetype) || real !== f.mimetype)
    return `${label}: định dạng không hợp lệ (chỉ nhận PNG/JPEG/WebP)`;
  return null;
}

export function validateGenerate(
  body: GenerateBody,
  files: { reference?: UploadedLike; mask?: UploadedLike; style?: UploadedLike[] },
  limits: { maxCount: number; maxBytes: number; promptMax?: number },
): { ok: true; value: ValidatedGenerate } | { ok: false; error: string } {
  if ((files.style?.length ?? 0) > MAX_STYLE_REFS) return { ok: false, error: `Tối đa ${MAX_STYLE_REFS} ảnh mẫu phong cách` };
  for (const [i, f] of (files.style ?? []).entries()) {
    const err = validateFile(f, `Ảnh mẫu phong cách ${i + 1}`, limits.maxBytes);
    if (err) return { ok: false, error: err };
  }
  const mode = body.mode === "variant" ? "variant" : body.mode === "master" || body.mode === undefined ? "master" : null;
  if (!mode) return { ok: false, error: "mode phải là master hoặc variant" };
  const prompt = String(body.prompt ?? "").trim();
  if (prompt.length < 3) return { ok: false, error: "Mô tả (prompt) quá ngắn" };
  if (prompt.length > (limits.promptMax ?? 4000)) return { ok: false, error: "Mô tả (prompt) quá dài" };
  const count = Math.round(Number(body.count ?? 2));
  if (!(count >= 1 && count <= limits.maxCount)) return { ok: false, error: `Số phương án phải từ 1 đến ${limits.maxCount}` };
  const width = Math.round(Number(body.width ?? 128));
  const height = Math.round(Number(body.height ?? 192));
  if (!(width >= 8 && width <= 2048 && height >= 8 && height <= 2048)) return { ok: false, error: "Kích thước không hợp lệ" };
  const seedRaw = body.seed;
  const seed = seedRaw === undefined || seedRaw === null || seedRaw === "" ? null : Math.round(Number(seedRaw));
  if (seed !== null && !Number.isFinite(seed)) return { ok: false, error: "Seed không hợp lệ" };

  for (const [key, label] of [["reference", "Ảnh tham chiếu"], ["mask", "Mask"]] as const) {
    const err = validateFile(files[key], label, limits.maxBytes);
    if (err) return { ok: false, error: err };
  }
  if (mode === "variant" && !files.reference) return { ok: false, error: "Chế độ Variant bắt buộc gửi ảnh master làm tham chiếu" };
  if (files.mask && !files.reference) return { ok: false, error: "Mask cần đi kèm ảnh tham chiếu" };
  if (files.mask && files.mask.mimetype !== "image/png") return { ok: false, error: "Mask phải là PNG" };

  const model = body.model ? String(body.model).trim() : "";
  if (model && !MODEL_ID_RE.test(model)) return { ok: false, error: "Tên model không hợp lệ" };
  const quality = body.quality ? String(body.quality).trim() : "";
  if (quality && !IMAGE_QUALITIES.includes(quality)) return { ok: false, error: "Chất lượng không hợp lệ" };
  return {
    ok: true,
    value: { mode, prompt, negativePrompt: String(body.negativePrompt ?? "").slice(0, 2000), count, aspect: { width, height }, seed, model: model || null, quality: quality || null },
  };
}
