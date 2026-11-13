import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ImageProvider, ProviderError } from "./ai.types";
import { MockProvider } from "./mock.provider";
import { OpenAiProvider } from "./openai.provider";
import { UploadedLike, validateGenerate, GenerateBody } from "./validation";

export interface GenerateResponse {
  provider: string;
  model: string;
  capabilities: ImageProvider["capabilities"];
  referenceUsed: boolean;
  maskUsed: boolean;
  /** number of style-example images the provider actually received */
  styleRefsUsed: number;
  /** true only when the provider conditions on reference+mask; never a guarantee of identical structure */
  structureConditioned: boolean;
  warnings: string[];
  params: Record<string, unknown>;
  estimatedCostUsd: number;
  usage: { today: number; limit: number };
  candidates: { id: string; mime: string; dataBase64: string; seed: number | null }[];
}

import { DEFAULT_OPENAI_MODEL, IMAGE_QUALITIES, OPENAI_MODEL_SUGGESTIONS } from "./models";
export { DEFAULT_OPENAI_MODEL };

/** Read env live (not cached) so settings saved at runtime take effect after reload(). Empty string = unset. */
const env = (key: string): string | undefined => {
  const v = process.env[key];
  return v === undefined || v.trim() === "" ? undefined : v.trim();
};

@Injectable()
export class AiService {
  private readonly log = new Logger("AiService");
  private provider: ImageProvider;
  private readonly usage = new Map<string, { day: string; count: number }>();

  // ConfigService kept for DI compatibility; values are read from process.env (kept in sync by AiSettingsService)
  constructor(private readonly config: ConfigService) {
    this.provider = this.createProvider();
    this.logProvider();
  }

  private logProvider() {
    this.log.log(`AI provider: ${this.provider.id} (${this.provider.model})${this.provider.isConfigured() ? "" : " - CHƯA CẤU HÌNH"}`);
  }

  /** Re-create the provider from the current process.env (after settings were saved). */
  reload() {
    this.provider = this.createProvider();
    this.logProvider();
  }

  get providerId() {
    return this.provider.id;
  }

  private num(key: string, def: number) {
    const v = Number(env(key));
    return Number.isFinite(v) && v > 0 ? v : def;
  }

  private createProvider(): ImageProvider {
    const id = (env("AI_PROVIDER") ?? "mock").toLowerCase();
    if (id === "openai")
      return new OpenAiProvider({
        apiKey: env("OPENAI_API_KEY") ?? "",
        baseUrl: env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
        model: env("OPENAI_IMAGE_MODEL") ?? DEFAULT_OPENAI_MODEL,
        quality: env("OPENAI_IMAGE_QUALITY") ?? "medium",
        background: env("OPENAI_IMAGE_BACKGROUND") ?? "",
        inputFidelity: env("OPENAI_INPUT_FIDELITY") ?? "",
      });
    if (id !== "mock") this.log.warn(`AI_PROVIDER="${id}" không được hỗ trợ - dùng mock`);
    return new MockProvider();
  }

  get requiresAuth(): boolean {
    return this.provider.id !== "mock";
  }

  get limits() {
    return {
      maxCount: Math.min(this.provider.capabilities.maxCount, this.num("AI_MAX_CANDIDATES", 4)),
      maxBytes: this.num("AI_MAX_UPLOAD_MB", 8) * 1024 * 1024,
      dailyLimit: this.num("AI_DAILY_IMAGE_LIMIT", 40),
      timeoutMs: this.num("AI_TIMEOUT_MS", 180_000),
      retries: Math.max(0, Math.round(Number(env("AI_MAX_RETRIES") ?? 1)) || 0),
      costPerImage: this.provider.id === "mock" ? 0 : Number(env("AI_COST_PER_IMAGE_USD") ?? 0.05) || 0,
    };
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  usageFor(key: string) {
    const u = this.usage.get(key);
    return u && u.day === this.today() ? u.count : 0;
  }

  info(userKey: string) {
    const l = this.limits;
    return {
      provider: this.provider.id,
      model: this.provider.model,
      configured: this.provider.isConfigured(),
      requiresAuth: this.requiresAuth,
      capabilities: this.provider.capabilities,
      /** per-request choices offered in Sprite Forge (real providers only) */
      imageModels: this.provider.id === "openai" ? OPENAI_MODEL_SUGGESTIONS : [],
      qualities: this.provider.id === "openai" ? IMAGE_QUALITIES.slice(0, 4) : [],
      defaultQuality: this.provider.id === "openai" ? env("OPENAI_IMAGE_QUALITY") ?? "medium" : null,
      limits: { maxCount: l.maxCount, maxUploadMb: l.maxBytes / 1048576, dailyLimit: l.dailyLimit, timeoutMs: l.timeoutMs, costPerImageUsd: l.costPerImage },
      usage: { today: this.usageFor(userKey), limit: l.dailyLimit },
    };
  }

  async generate(userKey: string, body: GenerateBody, files: { reference?: UploadedLike; mask?: UploadedLike; style?: UploadedLike[] }): Promise<GenerateResponse> {
    if (!this.provider.isConfigured()) throw new HttpException(`Provider "${this.provider.id}" chưa được cấu hình (thiếu API key trong server/.env)`, HttpStatus.SERVICE_UNAVAILABLE);
    const l = this.limits;
    const v = validateGenerate(body, files, { maxCount: l.maxCount, maxBytes: l.maxBytes });
    if (!v.ok) throw new HttpException(v.error, HttpStatus.BAD_REQUEST);
    const req = v.value;

    const used = this.usageFor(userKey);
    if (used + req.count > l.dailyLimit)
      throw new HttpException(`Đã dùng ${used}/${l.dailyLimit} ảnh hôm nay - vượt hạn mức AI_DAILY_IMAGE_LIMIT`, HttpStatus.TOO_MANY_REQUESTS);

    const caps = this.provider.capabilities;
    const warnings: string[] = [];
    const reference = files.reference ? { buffer: files.reference.buffer, mime: files.reference.mimetype } : null;
    const mask = files.mask ? { buffer: files.mask.buffer, mime: files.mask.mimetype } : null;
    if (reference && !caps.reference) warnings.push("Provider KHÔNG dùng ảnh tham chiếu - đầu ra không được coi là biến thể giữ cấu trúc.");
    if (mask && !caps.mask) warnings.push("Provider không hỗ trợ mask - mask bị bỏ qua.");
    const styleRefs = (files.style ?? []).map((f) => ({ buffer: f.buffer, mime: f.mimetype }));
    if (styleRefs.length && !caps.styleReference) warnings.push("Provider không hỗ trợ ảnh mẫu phong cách - ảnh mẫu bị bỏ qua.");

    let lastErr: unknown;
    for (let attempt = 0; attempt <= l.retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), l.timeoutMs);
      try {
        const result = await this.provider.generate(
          { ...req, reference: caps.reference ? reference : null, mask: caps.mask ? mask : null, styleRefs: caps.styleReference ? styleRefs : [] },
          ctrl.signal,
        );
        const count = result.images.length;
        this.usage.set(userKey, { day: this.today(), count: this.usageFor(userKey) + count });
        const referenceUsed = !!reference && caps.reference;
        const maskUsed = !!mask && caps.mask;
        return {
          provider: this.provider.id,
          model: result.model,
          capabilities: caps,
          referenceUsed,
          maskUsed,
          styleRefsUsed: caps.styleReference ? styleRefs.length : 0,
          structureConditioned: req.mode === "variant" && referenceUsed,
          warnings: [...warnings, ...result.warnings],
          params: { ...result.params, mode: req.mode, aspect: req.aspect, attempt: attempt + 1 },
          estimatedCostUsd: +(count * l.costPerImage).toFixed(4),
          usage: { today: this.usageFor(userKey), limit: l.dailyLimit },
          candidates: result.images.map((im, i) => ({ id: `c${Date.now().toString(36)}${i}`, mime: im.mime, dataBase64: im.buffer.toString("base64"), seed: im.seed })),
        };
      } catch (e) {
        lastErr = e;
        const aborted = (e as Error).name === "AbortError";
        const retryable = aborted || (e instanceof ProviderError && e.retryable);
        this.log.warn(`generate attempt ${attempt + 1} failed: ${(e as Error).message}`);
        if (!retryable || attempt === l.retries) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
    if ((lastErr as Error)?.name === "AbortError") throw new HttpException(`Hết thời gian chờ provider (${Math.round(l.timeoutMs / 1000)}s)`, HttpStatus.GATEWAY_TIMEOUT);
    if (lastErr instanceof ProviderError) throw new HttpException(lastErr.message, lastErr.status === 400 ? HttpStatus.BAD_REQUEST : lastErr.status === 402 ? HttpStatus.PAYMENT_REQUIRED : HttpStatus.BAD_GATEWAY);
    throw new HttpException(`Lỗi tạo ảnh: ${(lastErr as Error)?.message ?? "không rõ"}`, HttpStatus.BAD_GATEWAY);
  }
}
