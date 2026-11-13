"use client";

import { API_BASE, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

export interface AiInfo {
  provider: string;
  model: string;
  configured: boolean;
  requiresAuth: boolean;
  capabilities: { reference: boolean; styleReference?: boolean; mask: boolean; seed: boolean; maxCount: number };
  limits: { maxCount: number; maxUploadMb: number; dailyLimit: number; timeoutMs: number; costPerImageUsd: number };
  usage: { today: number; limit: number };
  /** models / qualities selectable per Generate (empty for mock) */
  imageModels?: { id: string; hint: string }[];
  qualities?: string[];
  defaultQuality?: string | null;
  /** image understanding / chat (Responses API) */
  vision?: { mode: "openai" | "mock"; model: string; dailyLimit: number };
}

export interface AiCandidate {
  id: string;
  mime: string;
  dataBase64: string;
  seed: number | null;
}

export interface AiGenerateResult {
  provider: string;
  model: string;
  capabilities: AiInfo["capabilities"];
  referenceUsed: boolean;
  maskUsed: boolean;
  styleRefsUsed?: number;
  structureConditioned: boolean;
  warnings: string[];
  params: Record<string, unknown>;
  estimatedCostUsd: number;
  usage: { today: number; limit: number };
  candidates: AiCandidate[];
}

export interface AiGenerateInput {
  mode: "master" | "variant" | "animation";
  prompt: string;
  negativePrompt?: string;
  count: number;
  width: number;
  height: number;
  seed?: number | null;
  /** per-request model / quality (server defaults when omitted) */
  model?: string | null;
  quality?: string | null;
  reference?: Blob | null;
  mask?: Blob | null;
  /** art-style examples (≤3), sent as extra input images */
  styleRefs?: Blob[];
}

function headers(): Record<string, string> {
  const t = useAuthStore.getState().token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data as { message?: string | string[] })?.message;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(", ") : msg || `Lỗi ${res.status}`);
  }
  return data as T;
}

export async function getAiInfo(): Promise<AiInfo> {
  try {
    return await parse<AiInfo>(await fetch(`${API_BASE}/ai/info`, { headers: headers() }));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, "Không kết nối được server AI. Hãy chạy server (cd server && npm run start:dev).");
  }
}

/** Key never leaves the server: the browser only talks to our backend. */
export async function generateImages(input: AiGenerateInput, signal?: AbortSignal): Promise<AiGenerateResult> {
  const form = new FormData();
  form.append("mode", input.mode);
  form.append("prompt", input.prompt);
  if (input.negativePrompt) form.append("negativePrompt", input.negativePrompt);
  form.append("count", String(input.count));
  form.append("width", String(input.width));
  form.append("height", String(input.height));
  if (input.seed != null) form.append("seed", String(input.seed));
  if (input.model) form.append("model", input.model);
  if (input.quality) form.append("quality", input.quality);
  if (input.reference) form.append("reference", input.reference, "reference.png");
  if (input.mask) form.append("mask", input.mask, "mask.png");
  (input.styleRefs ?? []).forEach((b, i) => form.append("style", b, `style_${i + 1}.png`));
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/ai/generate`, { method: "POST", headers: headers(), body: form, signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new ApiError(0, "Đã hủy");
    throw new ApiError(0, "Không kết nối được server AI. Hãy chắc chắn server đang chạy.");
  }
  return parse<AiGenerateResult>(res);
}

/* ---------------- image understanding & chat ---------------- */

export type DescribePurpose = "character" | "outfit" | "style" | "dna";

export interface VisionReply {
  text: string;
  model: string;
  mock: boolean;
  usage: unknown;
}

/** Upload an image; the AI writes an English generator prompt describing it. */
export async function describeImage(image: Blob, purpose: DescribePurpose): Promise<VisionReply> {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("image", image, "image.png");
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/ai/describe`, { method: "POST", headers: headers(), body: form });
  } catch {
    throw new ApiError(0, "Không kết nối được server AI. Hãy chắc chắn server đang chạy.");
  }
  return parse<VisionReply>(res);
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** data URLs */
  images?: string[];
}

export async function chatWithAi(messages: ChatMessage[], context?: { mode?: string; characterName?: string; prompt?: string }, signal?: AbortSignal): Promise<VisionReply> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/ai/chat`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ messages, context }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new ApiError(0, "Đã hủy");
    throw new ApiError(0, "Không kết nối được server AI. Hãy chắc chắn server đang chạy.");
  }
  return parse<VisionReply>(res);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Không đọc được ảnh"));
    r.readAsDataURL(blob);
  });
}

/** Split assistant text into plain text and ```prompt blocks (insertable into the description field). */
export function splitPromptBlocks(text: string): { type: "text" | "prompt"; value: string }[] {
  const out: { type: "text" | "prompt"; value: string }[] = [];
  const re = /```(?:prompt|text)?[ \t]*\r?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({ type: "prompt", value: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out.filter((p) => p.value.trim());
}
