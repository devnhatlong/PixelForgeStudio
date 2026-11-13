import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { PNG } from "pngjs";
import { dominantHue } from "./mock.provider";
import { sniffMime, UploadedLike } from "./validation";

/**
 * Image understanding + chat (OpenAI Responses API). Separate from image *generation*:
 * reads an uploaded picture and writes prompts / answers questions, like ChatGPT.
 * Falls back to an offline mock when AI_PROVIDER=mock or no key is set.
 */

export const DEFAULT_VISION_MODEL = "gpt-6.1-terra";
export const VISION_MODEL_SUGGESTIONS = [
  { id: "gpt-6.1-terra", hint: "Đọc ảnh tốt, rẻ (khuyên dùng)" },
  { id: "gpt-6-luna", hint: "Rẻ nhất" },
  { id: "gpt-6.1-sol", hint: "Thông minh hơn, đắt hơn" },
  { id: "gpt-6-astra", hint: "Mạnh nhất, đắt nhất" },
];

export type DescribePurpose = "character" | "outfit" | "style";

const DESCRIBE_INSTRUCTIONS: Record<DescribePurpose, string> = {
  character:
    "You help a non-artist make a 2D pixel-art game (chibi, ancient Eastern / wuxia setting). Look at the image and write ONE concise English prompt for an image generator describing ONLY the character's design: gender and apparent age, face, hairstyle and hair color, outfit layers with colors and materials, accessories, weapon. Do NOT mention background, pose, camera angle, lighting or art style. Max 70 words, a single paragraph, no preface, no quotes.",
  outfit:
    "You help a non-artist make a 2D pixel-art game (chibi, ancient Eastern / wuxia setting). Look at the image and write ONE concise English prompt describing ONLY the clothing/outfit (garment layers, colors, materials, patterns, belt, accessories) so it can be applied to another character. Do NOT describe the face, hair, body, pose, background or art style. Max 50 words, single paragraph, no preface.",
  style:
    "Describe ONLY the art style of the image in concise English for an image generator: pixel density / resolution feel, outline thickness and color, shading method, number and mood of colors, proportions (head-to-body ratio). Do NOT describe the content or characters. Max 45 words, single paragraph, no preface.",
};

const CHAT_INSTRUCTIONS = `You are the in-app assistant of "Sprite Forge", a tool that helps a solo developer who cannot draw create consistent 2D pixel-art character sprites (chibi, ancient Eastern / wuxia, Unity game "Huyền Ấn").
- Reply in the user's language (usually Vietnamese), short and practical.
- You can see images the user attaches. Describe/critique them concretely (silhouette at small size, readability, colors, consistency between master and outfit variants).
- When you propose text for the image generator, write it in ENGLISH inside a fenced block that starts with \`\`\`prompt so the app can insert it. One block per prompt. Prompts describe the character/outfit only (the app already adds view, pose and style).
- Be honest: AI image generation cannot guarantee identical faces/proportions between images; suggest masks, the master reference and manual pixel fixes when relevant.`;

export interface ChatMessageIn {
  role: "user" | "assistant";
  text: string;
  /** data URLs (data:image/png;base64,...) */
  images?: string[];
}

export interface ChatContextIn {
  mode?: string;
  characterName?: string;
  prompt?: string;
}

const MAX_MESSAGES = 30;
const MAX_TEXT = 4000;
const MAX_IMAGES_PER_REQUEST = 6;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const env = (k: string) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

function parseDataUrl(url: string): { mime: string; buf: Buffer } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url ?? "");
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  return sniffMime(buf) === m[1] ? { mime: m[1], buf } : null;
}

/** Validate chat payload (pure; unit-tested). */
export function validateChat(messages: ChatMessageIn[] | undefined): { ok: true; value: ChatMessageIn[] } | { ok: false; error: string } {
  if (!Array.isArray(messages) || !messages.length) return { ok: false, error: "Chưa có tin nhắn" };
  if (messages.length > MAX_MESSAGES) return { ok: false, error: `Cuộc trò chuyện quá dài (tối đa ${MAX_MESSAGES} tin) — bấm "Cuộc mới"` };
  let images = 0;
  const out: ChatMessageIn[] = [];
  for (const m of messages) {
    if (m?.role !== "user" && m?.role !== "assistant") return { ok: false, error: "role không hợp lệ" };
    const text = String(m.text ?? "").slice(0, MAX_TEXT);
    const imgs = m.role === "user" ? (m.images ?? []) : [];
    for (const u of imgs) {
      const p = parseDataUrl(u);
      if (!p) return { ok: false, error: "Ảnh đính kèm không hợp lệ (chỉ PNG/JPEG/WebP)" };
      if (p.buf.length > MAX_IMAGE_BYTES) return { ok: false, error: "Ảnh đính kèm quá lớn (tối đa 4MB)" };
    }
    images += imgs.length;
    if (!text.trim() && !imgs.length) continue;
    out.push({ role: m.role, text, images: imgs });
  }
  if (images > MAX_IMAGES_PER_REQUEST) return { ok: false, error: `Tối đa ${MAX_IMAGES_PER_REQUEST} ảnh trong một cuộc trò chuyện — bấm "Cuộc mới"` };
  if (!out.length || out[out.length - 1].role !== "user") return { ok: false, error: "Tin nhắn cuối phải là của người dùng" };
  return { ok: true, value: out };
}

/** Responses API input array from our chat messages. */
export function toResponsesInput(messages: ChatMessageIn[]) {
  return messages.map((m) =>
    m.role === "assistant"
      ? { role: "assistant", content: m.text }
      : {
          role: "user",
          content: [
            ...(m.text.trim() ? [{ type: "input_text", text: m.text }] : []),
            ...(m.images ?? []).map((u) => ({ type: "input_image", image_url: u, detail: "auto" })),
          ],
        },
  );
}

/** Text of a Responses API result (raw JSON has no output_text helper → walk output[].content[]). */
export function extractOutputText(json: unknown): string {
  const j = json as { output_text?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  if (typeof j?.output_text === "string" && j.output_text) return j.output_text;
  return (j?.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text" && c.text)
    .map((c) => c.text)
    .join("\n")
    .trim();
}

@Injectable()
export class VisionService {
  private readonly log = new Logger("Vision");
  private readonly usage = new Map<string, { day: string; count: number }>();

  get model() {
    return env("OPENAI_VISION_MODEL") ?? DEFAULT_VISION_MODEL;
  }

  /** real = OpenAI with a key; otherwise offline mock */
  get mode(): "openai" | "mock" {
    return (env("AI_PROVIDER") ?? "mock") === "openai" && env("OPENAI_API_KEY") ? "openai" : "mock";
  }

  info() {
    return { mode: this.mode, model: this.mode === "openai" ? this.model : "mock-vision", dailyLimit: this.dailyLimit };
  }

  private get dailyLimit() {
    return Number(env("AI_DAILY_CHAT_LIMIT")) || 200;
  }

  private count(userKey: string) {
    const day = new Date().toISOString().slice(0, 10);
    const u = this.usage.get(userKey);
    const n = u && u.day === day ? u.count : 0;
    if (n >= this.dailyLimit) throw new HttpException(`Đã dùng ${n}/${this.dailyLimit} lượt đọc ảnh/chat hôm nay (AI_DAILY_CHAT_LIMIT)`, HttpStatus.TOO_MANY_REQUESTS);
    this.usage.set(userKey, { day, count: n + 1 });
  }

  private async callResponses(body: Record<string, unknown>): Promise<{ text: string; usage: unknown }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Number(env("AI_TIMEOUT_MS")) || 120_000);
    try {
      const res = await fetch(`${env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1"}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, ...body }),
        signal: ctrl.signal,
      });
      const raw = await res.text();
      let json: { error?: { message?: string; code?: string }; usage?: unknown } = {};
      try {
        json = JSON.parse(raw);
      } catch {
        /* keep raw */
      }
      if (!res.ok) {
        if (json.error?.code === "insufficient_quota") throw new HttpException("Tài khoản OpenAI API đã hết credit — nạp thêm tại platform.openai.com → Billing", HttpStatus.PAYMENT_REQUIRED);
        throw new HttpException(`OpenAI lỗi ${res.status}: ${json.error?.message ?? raw.slice(0, 200)}`, res.status === 400 ? HttpStatus.BAD_REQUEST : HttpStatus.BAD_GATEWAY);
      }
      const text = extractOutputText(json);
      if (!text) throw new HttpException("AI không trả lời (rỗng)", HttpStatus.BAD_GATEWAY);
      return { text, usage: json.usage ?? null };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      if ((e as Error).name === "AbortError") throw new HttpException("Hết thời gian chờ OpenAI", HttpStatus.GATEWAY_TIMEOUT);
      throw new HttpException(`Không kết nối được OpenAI: ${(e as Error).message}`, HttpStatus.BAD_GATEWAY);
    } finally {
      clearTimeout(t);
    }
  }

  async describe(userKey: string, file: UploadedLike | undefined, purpose: string) {
    if (!file) throw new HttpException("Thiếu ảnh", HttpStatus.BAD_REQUEST);
    const mime = sniffMime(file.buffer);
    if (!mime) throw new HttpException("Chỉ nhận PNG/JPEG/WebP", HttpStatus.BAD_REQUEST);
    if (file.size > MAX_IMAGE_BYTES * 2) throw new HttpException("Ảnh quá lớn (tối đa 8MB)", HttpStatus.BAD_REQUEST);
    const p: DescribePurpose = purpose === "outfit" || purpose === "style" ? purpose : "character";
    this.count(userKey);
    if (this.mode === "mock") return { text: mockDescribe(file.buffer, p), model: "mock-vision", usage: null, mock: true };
    const dataUrl = `data:${mime};base64,${file.buffer.toString("base64")}`;
    const r = await this.callResponses({
      instructions: DESCRIBE_INSTRUCTIONS[p],
      input: [{ role: "user", content: [{ type: "input_text", text: "Describe this image as instructed." }, { type: "input_image", image_url: dataUrl, detail: "auto" }] }],
      max_output_tokens: 400,
    });
    return { text: cleanDescribeText(r.text), model: this.model, usage: r.usage, mock: false };
  }

  async chat(userKey: string, messages: ChatMessageIn[] | undefined, context?: ChatContextIn) {
    const v = validateChat(messages);
    if (!v.ok) throw new HttpException(v.error, HttpStatus.BAD_REQUEST);
    this.count(userKey);
    if (this.mode === "mock") return { text: mockChat(v.value), model: "mock-vision", usage: null, mock: true };
    const ctx = context
      ? `\n\nCurrent Sprite Forge form: mode=${context.mode ?? "?"}, character="${String(context.characterName ?? "").slice(0, 80)}", current prompt="${String(context.prompt ?? "").slice(0, 600)}".`
      : "";
    const r = await this.callResponses({ instructions: CHAT_INSTRUCTIONS + ctx, input: toResponsesInput(v.value), max_output_tokens: 1200 });
    this.log.debug(`chat ok (${v.value.length} msgs)`);
    return { text: r.text, model: this.model, usage: r.usage, mock: false };
  }
}

/** Keep only the prompt: content of the first fenced block if any, without surrounding quotes. */
export function cleanDescribeText(text: string): string {
  const fenced = /```[a-z]*[ \t]*\r?\n([\s\S]*?)```/i.exec(text);
  return (fenced ? fenced[1] : text).trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

/* ---------------- offline mock ---------------- */

const HUE_NAMES: [number, string][] = [
  [15, "red"], [40, "orange"], [65, "golden yellow"], [150, "green"], [190, "teal"], [250, "blue"], [290, "purple"], [335, "magenta"], [360, "red"],
];
const hueName = (h: number | null) => (h == null ? "muted" : HUE_NAMES.find(([max]) => h < max)?.[1] ?? "red");

export function mockDescribe(buf: Buffer, purpose: DescribePurpose): string {
  let size = "";
  try {
    const img = PNG.sync.read(buf);
    size = ` (${img.width}×${img.height})`;
  } catch {
    /* not png */
  }
  const color = hueName(dominantHue(buf));
  if (purpose === "style") return `[MOCK${size}] clean pixel art, 1px dark outline, flat cel shading with one shadow tone, limited palette dominated by ${color}, chibi proportions with large head`;
  if (purpose === "outfit") return `[MOCK${size}] layered ${color} wuxia robe with darker trim, wide cloth belt, fitted sleeves, dark trousers and simple cloth boots`;
  return `[MOCK${size}] young male swordsman, calm face, long black hair tied in a topknot, ${color} and black wuxia robe with wide belt, dark trousers, cloth boots, straight jian sword at the waist`;
}

function mockChat(messages: ChatMessageIn[]): string {
  const last = messages[messages.length - 1];
  const n = last.images?.length ?? 0;
  return `[MOCK — chưa bật OpenAI] Mình nhận được tin nhắn${n ? ` kèm ${n} ảnh` : ""}. Khi bật provider OpenAI trong Cài đặt AI, mình sẽ trả lời thật. Ví dụ prompt có thể chèn:\n\n\`\`\`prompt\nyoung female archer, short brown hair with a red ribbon, green hunter tunic with leather vambraces, quiver on the back\n\`\`\``;
}
