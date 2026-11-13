import { Body, Controller, Get, HttpException, HttpStatus, Module, Post, Req, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor, FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { AuthModule } from "../auth/auth.module";
import { OptionalAuthGuard } from "../auth/optional-auth.guard";
import type { JwtPayload } from "../auth/auth.guard";
import { AiService } from "./ai.service";
import { AiSettingsController, AiSettingsService } from "./ai-settings";
import { ChatContextIn, ChatMessageIn, VisionService } from "./vision";
import { GenerateBody, HARD_UPLOAD_LIMIT_BYTES, MAX_STYLE_REFS, UploadedLike } from "./validation";

type AuthedRequest = Request & { user?: JwtPayload };

@Controller("ai")
@UseGuards(OptionalAuthGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly vision: VisionService,
  ) {}

  private userKey(req: AuthedRequest): string {
    if (req.user) return `u:${req.user.sub}`;
    if (this.ai.requiresAuth) throw new HttpException("Cần đăng nhập để dùng AI provider thật (chặn tiêu tốn API key ngoài ý muốn)", HttpStatus.UNAUTHORIZED);
    return `anon:${req.ip}`;
  }

  /** provider, capabilities, limits and today's usage (public; no secrets) */
  @Get("info")
  info(@Req() req: AuthedRequest) {
    return { ...this.ai.info(req.user ? `u:${req.user.sub}` : `anon:${req.ip}`), vision: this.vision.info() };
  }

  /**
   * multipart/form-data: mode, prompt, negativePrompt, count, width, height, seed + files reference?, mask?, style[] (≤3)
   * Returns candidates as base64 PNG. Nothing is persisted server-side here; the client stores what the user picks.
   */
  @Post("generate")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "reference", maxCount: 1 },
        { name: "mask", maxCount: 1 },
        { name: "style", maxCount: MAX_STYLE_REFS },
      ],
      { limits: { fileSize: HARD_UPLOAD_LIMIT_BYTES, files: 2 + MAX_STYLE_REFS, fields: 20 } },
    ),
  )
  generate(
    @Req() req: AuthedRequest,
    @Body() body: GenerateBody,
    @UploadedFiles() files: { reference?: UploadedLike[]; mask?: UploadedLike[]; style?: UploadedLike[] } = {},
  ) {
    return this.ai.generate(this.userKey(req), body ?? {}, { reference: files?.reference?.[0], mask: files?.mask?.[0], style: files?.style ?? [] });
  }

  private visionUserKey(req: AuthedRequest): string {
    if (req.user) return `u:${req.user.sub}`;
    if (this.vision.mode === "openai") throw new HttpException("Cần đăng nhập để dùng AI đọc ảnh / chat", HttpStatus.UNAUTHORIZED);
    return `anon:${req.ip}`;
  }

  /** multipart: image + purpose (character | outfit | style) → English prompt text describing it */
  @Post("describe")
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: HARD_UPLOAD_LIMIT_BYTES, files: 1 } }))
  describe(@Req() req: AuthedRequest, @Body() body: { purpose?: string }, @UploadedFile() image?: UploadedLike) {
    return this.vision.describe(this.visionUserKey(req), image, body?.purpose ?? "character");
  }

  /** JSON: { messages: [{role, text, images?: dataUrl[]}], context? } → assistant reply (ChatGPT-like, with vision) */
  @Post("chat")
  chat(@Req() req: AuthedRequest, @Body() body: { messages?: ChatMessageIn[]; context?: ChatContextIn }) {
    return this.vision.chat(this.visionUserKey(req), body?.messages, body?.context);
  }
}

@Module({
  imports: [AuthModule],
  // AiSettingsController first: "ai/settings" must not be shadowed by other ai/* routes
  controllers: [AiSettingsController, AiController],
  providers: [AiService, AiSettingsService, VisionService, OptionalAuthGuard],
})
export class AiModule {}
