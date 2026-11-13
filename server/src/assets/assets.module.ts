import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { promises as fs } from "fs";
import { join, resolve } from "path";
import { AuthGuard, CurrentUser, JwtPayload } from "../auth/auth.guard";
import { AuthModule } from "../auth/auth.module";
import { HARD_UPLOAD_LIMIT_BYTES, UploadedLike, sniffMime } from "../ai/validation";
import { SERVER_ROOT } from "../load-env";

const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
 * Immutable binary assets of the sprite pipeline (original AI/source images, cleaned images, masks).
 * Stored on disk under STORAGE_DIR/<ownerId>/<assetId>.<ext> - kept out of MongoDB so project
 * documents stay small. An asset id can be written once; re-uploading the same id is a no-op.
 */
@Injectable()
export class AssetsService {
  readonly root: string;
  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>("STORAGE_DIR") || join(SERVER_ROOT, "storage", "assets"));
  }

  private dir(ownerId: string) {
    if (!/^[a-f0-9]{24}$/i.test(ownerId)) throw new BadRequestException();
    return join(this.root, ownerId);
  }

  private async find(ownerId: string, id: string): Promise<{ path: string; mime: string } | null> {
    for (const [mime, ext] of Object.entries(EXT)) {
      const p = join(this.dir(ownerId), `${id}.${ext}`);
      try {
        await fs.access(p);
        return { path: p, mime };
      } catch {
        /* next */
      }
    }
    return null;
  }

  async save(ownerId: string, id: string, file: UploadedLike | undefined, maxBytes: number) {
    if (!ID_RE.test(id ?? "")) throw new BadRequestException("assetId không hợp lệ");
    if (!file) throw new BadRequestException("Thiếu file");
    if (file.size > maxBytes) throw new BadRequestException("File quá lớn");
    const mime = sniffMime(file.buffer);
    if (!mime || !EXT[mime]) throw new BadRequestException("Chỉ nhận PNG/JPEG/WebP");
    const existing = await this.find(ownerId, id);
    if (existing) return { id, mime: existing.mime, existed: true };
    await fs.mkdir(this.dir(ownerId), { recursive: true });
    await fs.writeFile(join(this.dir(ownerId), `${id}.${EXT[mime]}`), file.buffer, { flag: "wx" });
    return { id, mime, existed: false };
  }

  async get(ownerId: string, id: string) {
    if (!ID_RE.test(id ?? "")) throw new NotFoundException();
    const f = await this.find(ownerId, id);
    if (!f) throw new NotFoundException("Không tìm thấy asset");
    return f;
  }
}

@Controller("assets")
@UseGuards(AuthGuard)
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly config: ConfigService,
  ) { }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: HARD_UPLOAD_LIMIT_BYTES, files: 1 } }))
  upload(@CurrentUser() user: JwtPayload, @Body() body: { id?: string }, @UploadedFile() file?: UploadedLike) {
    const maxMb = Number(this.config.get("ASSET_MAX_UPLOAD_MB") ?? 16) || 16;
    return this.assets.save(user.sub, String(body?.id ?? ""), file, maxMb * 1048576);
  }

  @Get(":id")
  async get(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Res() res: Response) {
    const f = await this.assets.get(user.sub, id);
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(f.path);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule { }
