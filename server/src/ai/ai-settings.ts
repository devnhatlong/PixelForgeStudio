import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Logger, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { promises as fs } from "fs";
import { AuthGuard } from "../auth/auth.guard";
import { ENV_FILE } from "../load-env";
import { AiService } from "./ai.service";
import { DEFAULT_OPENAI_MODEL, IMAGE_QUALITIES, OPENAI_MODEL_SUGGESTIONS } from "./models";
import { isLoopback, maskKey, updateEnvText } from "./env-file";
import { DEFAULT_VISION_MODEL, VISION_MODEL_SUGGESTIONS } from "./vision";

export { OPENAI_MODEL_SUGGESTIONS };

const QUALITIES = IMAGE_QUALITIES;
const BACKGROUNDS = ["", "transparent", "opaque", "auto"];

export interface AiSettingsBody {
  provider?: string;
  apiKey?: string;
  clearKey?: boolean;
  model?: string;
  visionModel?: string;
  quality?: string;
  background?: string;
  dailyLimit?: number;
  maxCandidates?: number;
  costPerImageUsd?: number;
}

/** Pure validation → env updates (unit-tested). */
export function settingsToEnv(b: AiSettingsBody): Record<string, string> {
  const u: Record<string, string> = {};
  if (b.provider !== undefined) {
    if (!["mock", "openai"].includes(b.provider)) throw new BadRequestException("Provider không hợp lệ");
    u.AI_PROVIDER = b.provider;
  }
  if (b.clearKey) u.OPENAI_API_KEY = "";
  else if (b.apiKey !== undefined && b.apiKey.trim() !== "") {
    const k = b.apiKey.trim();
    if (!/^[A-Za-z0-9_\-]{20,300}$/.test(k.replace(/^sk-/, "sk_"))) throw new BadRequestException("API key không đúng định dạng (thường bắt đầu bằng sk-)");
    u.OPENAI_API_KEY = k;
  }
  if (b.model !== undefined) {
    const m = b.model.trim();
    if (!/^[A-Za-z0-9._:\-]{2,80}$/.test(m)) throw new BadRequestException("Tên model không hợp lệ");
    u.OPENAI_IMAGE_MODEL = m;
  }
  if (b.visionModel !== undefined) {
    const m = b.visionModel.trim();
    if (!/^[A-Za-z0-9._:\-]{2,80}$/.test(m)) throw new BadRequestException("Tên model đọc ảnh không hợp lệ");
    u.OPENAI_VISION_MODEL = m;
  }
  if (b.quality !== undefined) {
    if (!QUALITIES.includes(b.quality)) throw new BadRequestException("Quality không hợp lệ");
    u.OPENAI_IMAGE_QUALITY = b.quality;
  }
  if (b.background !== undefined) {
    if (!BACKGROUNDS.includes(b.background)) throw new BadRequestException("Background không hợp lệ");
    u.OPENAI_IMAGE_BACKGROUND = b.background;
  }
  if (b.dailyLimit !== undefined) {
    const n = Math.round(Number(b.dailyLimit));
    if (!(n >= 1 && n <= 1000)) throw new BadRequestException("Hạn mức ngày phải 1–1000");
    u.AI_DAILY_IMAGE_LIMIT = String(n);
  }
  if (b.maxCandidates !== undefined) {
    const n = Math.round(Number(b.maxCandidates));
    if (!(n >= 1 && n <= 4)) throw new BadRequestException("Số phương án tối đa phải 1–4");
    u.AI_MAX_CANDIDATES = String(n);
  }
  if (b.costPerImageUsd !== undefined) {
    const n = Number(b.costPerImageUsd);
    if (!(n >= 0 && n <= 10)) throw new BadRequestException("Chi phí/ảnh phải 0–10 USD");
    u.AI_COST_PER_IMAGE_USD = String(n);
  }
  return u;
}

@Injectable()
export class AiSettingsService {
  private readonly log = new Logger("AiSettings");
  constructor(private readonly ai: AiService) { }

  read() {
    const e = process.env;
    return {
      provider: (e.AI_PROVIDER || "mock").toLowerCase(),
      openai: {
        keySet: !!e.OPENAI_API_KEY?.trim(),
        keyHint: maskKey(e.OPENAI_API_KEY),
        model: e.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
        visionModel: e.OPENAI_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL,
        quality: e.OPENAI_IMAGE_QUALITY?.trim() || "medium",
        background: e.OPENAI_IMAGE_BACKGROUND?.trim() || "",
      },
      limits: {
        dailyLimit: Number(e.AI_DAILY_IMAGE_LIMIT) || 40,
        maxCandidates: Number(e.AI_MAX_CANDIDATES) || 4,
        costPerImageUsd: Number(e.AI_COST_PER_IMAGE_USD ?? 0.05) || 0,
      },
      models: OPENAI_MODEL_SUGGESTIONS,
      visionModels: VISION_MODEL_SUGGESTIONS,
      envFile: ENV_FILE,
    };
  }

  async save(body: AiSettingsBody) {
    const updates = settingsToEnv(body ?? {});
    if (!Object.keys(updates).length) return this.read();
    let text = "";
    try {
      text = await fs.readFile(ENV_FILE, "utf8");
    } catch {
      /* new file */
    }
    const next = updateEnvText(text, updates);
    const tmp = `${ENV_FILE}.tmp`;
    await fs.writeFile(tmp, next, { encoding: "utf8", mode: 0o600 });
    await fs.rename(tmp, ENV_FILE);
    for (const [k, v] of Object.entries(updates)) process.env[k] = v;
    this.ai.reload();
    this.log.log(`Đã lưu cấu hình AI: ${Object.keys(updates).map((k) => (k === "OPENAI_API_KEY" ? `${k}=${maskKey(updates[k]) ?? "(xóa)"}` : `${k}=${updates[k]}`)).join(", ")}`);
    return this.read();
  }

  /** Cheap check (no image generated, no cost): image model, then vision/chat model. */
  async test(body: { apiKey?: string; model?: string; visionModel?: string }) {
    const first = await this.testModel(body?.apiKey, body?.model?.trim() || process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_OPENAI_MODEL);
    if (!first.ok) return first;
    const vm = body?.visionModel?.trim() || process.env.OPENAI_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;
    const second = await this.testModel(body?.apiKey, vm);
    return second.ok ? { ok: true, message: `${first.message}; đọc ảnh/chat: ${vm} OK` } : { ok: false, message: `Tạo ảnh OK, nhưng model đọc ảnh lỗi: ${second.message}` };
  }

  private async testModel(apiKey: string | undefined, model: string) {
    const key = apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
    if (!key) return { ok: false, message: "Chưa có API key" };
    const base = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(`${base}/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${key}` }, signal: ctrl.signal });
      if (res.ok) return { ok: true, message: `Key hợp lệ và có quyền dùng model ${model}` };
      const text = await res.text();
      let msg = text.slice(0, 200);
      try {
        msg = JSON.parse(text)?.error?.message ?? msg;
      } catch {
        /* keep text */
      }
      if (res.status === 401) return { ok: false, message: `Key không hợp lệ hoặc đã bị thu hồi (401). ${msg}` };
      if (res.status === 404) return { ok: false, message: `Key hợp lệ nhưng không thấy model "${model}" (404) - kiểm tra tên model hoặc quyền truy cập của tổ chức.` };
      if (res.status === 429) return { ok: false, message: `Bị giới hạn / hết credit (429). ${msg}` };
      return { ok: false, message: `OpenAI trả lỗi ${res.status}: ${msg}` };
    } catch (e) {
      return { ok: false, message: (e as Error).name === "AbortError" ? "Hết thời gian chờ OpenAI (15s)" : `Không kết nối được OpenAI: ${(e as Error).message}` };
    } finally {
      clearTimeout(t);
    }
  }
}

/** Only from the machine running the server (and logged in): the key must never be settable over the LAN. */
function assertLocal(req: Request) {
  if (process.env.AI_SETTINGS_ALLOW_REMOTE === "true") return;
  if (!isLoopback(req.socket?.remoteAddress)) throw new ForbiddenException("Chỉ đổi cấu hình AI được từ chính máy chạy server");
}

@Controller("ai/settings")
@UseGuards(AuthGuard)
export class AiSettingsController {
  constructor(private readonly settings: AiSettingsService) { }

  @Get()
  get(@Req() req: Request) {
    assertLocal(req);
    return this.settings.read();
  }

  @Put()
  put(@Req() req: Request, @Body() body: AiSettingsBody) {
    assertLocal(req);
    return this.settings.save(body);
  }

  @Post("test")
  test(@Req() req: Request, @Body() body: { apiKey?: string; model?: string; visionModel?: string }) {
    assertLocal(req);
    return this.settings.test(body);
  }
}
