import { PNG } from "pngjs";
import { GenerateRequest, ImageProvider, ProviderError, ProviderResult } from "./ai.types";

export interface OpenAiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** low | medium | high | auto */
  quality: string;
  /** transparent | opaque | auto */
  background: string;
  /** "high" helps keep faces/proportions in edits (if the model supports it); empty = not sent */
  inputFidelity: string;
}

/** Our mask convention (white = editable) → OpenAI convention (alpha 0 = editable). */
export function toOpenAiMask(mask: Buffer): Buffer {
  const m = PNG.sync.read(mask);
  const out = new PNG({ width: m.width, height: m.height });
  for (let i = 0; i < m.width * m.height; i++) {
    const o = i * 4;
    const editable = m.data[o] >= 128 && m.data[o + 3] >= 128;
    out.data[o] = out.data[o + 1] = out.data[o + 2] = 0;
    out.data[o + 3] = editable ? 0 : 255;
  }
  return PNG.sync.write(out);
}

function sizeFor(aspect: { width: number; height: number }): string {
  const r = aspect.width / aspect.height;
  if (r < 0.85) return "1024x1536";
  if (r > 1.15) return "1536x1024";
  return "1024x1024";
}

/**
 * OpenAI Images API adapter (generations for masters, edits + mask for variants).
 * NOTE: written against the public API shape; verify with your own key/model - model names and
 * optional parameters change over time and are therefore all configurable via .env.
 */
export class OpenAiProvider implements ImageProvider {
  readonly id = "openai";
  readonly capabilities = { reference: true, styleReference: true, mask: true, seed: false, maxCount: 4 };
  constructor(private readonly cfg: OpenAiConfig) { }

  get model() {
    return this.cfg.model;
  }

  isConfigured() {
    return !!this.cfg.apiKey;
  }

  async generate(req: GenerateRequest, signal: AbortSignal): Promise<ProviderResult> {
    const size = sizeFor(req.aspect);
    const prompt = req.negativePrompt ? `${req.prompt}\n\nAvoid: ${req.negativePrompt}` : req.prompt;
    const model = req.model || this.cfg.model;
    const quality = req.quality || this.cfg.quality;
    const params: Record<string, unknown> = { model, size, n: req.count };
    if (quality) params.quality = quality;
    if (this.cfg.background) params.background = this.cfg.background;
    const warnings: string[] = [];
    if (req.seed != null) warnings.push("OpenAI không hỗ trợ seed - kết quả không tái lập chính xác.");

    let res: Response;
    try {
      // input images: the character to keep first (the mask applies to the first image), then style examples
      const inputs = [...(req.mode === "variant" && req.reference ? [{ img: req.reference, name: "reference" }] : []), ...(req.styleRefs ?? []).map((img, i) => ({ img, name: `style_${i + 1}` }))];
      if (inputs.length) {
        if (this.cfg.inputFidelity) params.input_fidelity = this.cfg.inputFidelity;
        const form = new FormData();
        for (const [k, v] of Object.entries(params)) form.append(k, String(v));
        form.append("prompt", prompt);
        const field = inputs.length > 1 ? "image[]" : "image";
        for (const { img, name } of inputs) form.append(field, new Blob([new Uint8Array(img.buffer)], { type: img.mime }), `${name}.${img.mime === "image/jpeg" ? "jpg" : img.mime === "image/webp" ? "webp" : "png"}`);
        params.inputImages = inputs.map((i) => i.name);
        if (req.mask && req.mode === "variant" && req.reference) form.append("mask", new Blob([new Uint8Array(toOpenAiMask(req.mask.buffer))], { type: "image/png" }), "mask.png");
        res = await fetch(`${this.cfg.baseUrl}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${this.cfg.apiKey}` }, body: form, signal });
      } else {
        res = await fetch(`${this.cfg.baseUrl}/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...params, prompt }),
          signal,
        });
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ProviderError(`Không kết nối được OpenAI: ${(e as Error).message}`, 502, true);
    }

    const text = await res.text();
    let json: { data?: { b64_json?: string }[]; error?: { message?: string; code?: string; type?: string } } = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      const msg = json.error?.message ?? text.slice(0, 300);
      if (json.error?.code === "insufficient_quota" || json.error?.type === "insufficient_quota")
        throw new ProviderError(`Tài khoản OpenAI API đã hết credit — nạp thêm tại platform.openai.com → Billing. (${msg})`, 402, false);
      const retryable = res.status === 429 || res.status >= 500;
      throw new ProviderError(`OpenAI lỗi ${res.status}: ${msg}`, res.status === 400 ? 400 : 502, retryable);
    }
    const images = (json.data ?? [])
      .filter((d) => d.b64_json)
      .map((d) => ({ buffer: Buffer.from(d.b64_json!, "base64"), mime: "image/png", seed: null }));
    if (!images.length) throw new ProviderError("OpenAI không trả về ảnh nào", 502, true);
    if (req.mode === "variant" && !req.mask) warnings.push("Không có mask: model có thể thay đổi cả mặt/dáng - cần so sánh overlay với master.");
    return { images, model, params, warnings };
  }
}
