import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types, isValidObjectId } from "mongoose";
import { Project, ProjectDocument } from "./project.schema";

export interface UpsertProjectDto {
  clientId: string;
  name: string;
  width: number;
  height: number;
  frameCount: number;
  thumbnail?: string;
  data: Record<string, unknown>;
  docUpdatedAt?: number;
  folderId?: string | null;
  deleted?: boolean;
  deletedAt?: number | null;
}

export type ProjectSummaryRecord = Omit<Project, "data"> & { _id: Types.ObjectId; stale?: boolean };

export interface ProjectMetaDto {
  clientId: string;
  name?: string;
  folderId?: string | null;
  deleted?: boolean;
  deletedAt?: number | null;
}

const SUMMARY = "-data";
const MAX_DATA_BYTES = 8 * 1024 * 1024;

@Injectable()
export class ProjectsService {
  constructor(@InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>) {}

  /** all of the user's projects (including trashed ones) without pixel data */
  listMine(ownerId: string) {
    return this.projectModel.find({ ownerId: new Types.ObjectId(ownerId) }).select(SUMMARY).sort({ updatedAt: -1 }).limit(1000).lean();
  }

  async upsert(ownerId: string, ownerName: string, dto: UpsertProjectDto): Promise<ProjectSummaryRecord> {
    if (!dto?.clientId || !dto.name || !dto.data) throw new BadRequestException("Thiếu dữ liệu project");
    if (JSON.stringify(dto.data).length > MAX_DATA_BYTES) throw new BadRequestException("Project quá lớn (tối đa 8MB)");
    const w = Number(dto.width), h = Number(dto.height);
    if (!(w >= 1 && w <= 512 && h >= 1 && h <= 512)) throw new BadRequestException("Kích thước không hợp lệ");
    const now = Date.now();
    const docUpdatedAt = Number(dto.docUpdatedAt) || Number((dto.data as { updatedAt?: number }).updatedAt) || now;

    const filter = { ownerId: new Types.ObjectId(ownerId), clientId: dto.clientId };
    // last-write-wins: never overwrite a newer document with an older one
    const existing = await this.projectModel.findOne(filter).select("docUpdatedAt").lean();
    if (existing && existing.docUpdatedAt > docUpdatedAt) {
      const current = await this.projectModel.findOne(filter).select(SUMMARY).lean();
      return { ...(current as unknown as ProjectSummaryRecord), stale: true };
    }

    const $set: Record<string, unknown> = {
      name: String(dto.name).slice(0, 120),
      ownerName,
      width: w,
      height: h,
      frameCount: Number(dto.frameCount) || 1,
      thumbnail: typeof dto.thumbnail === "string" ? dto.thumbnail.slice(0, 200_000) : "",
      data: dto.data,
      docUpdatedAt,
      updatedAt: now,
    };
    if (dto.folderId !== undefined) $set.folderId = dto.folderId || null;
    if (dto.deleted !== undefined) {
      $set.deleted = !!dto.deleted;
      $set.deletedAt = dto.deleted ? Number(dto.deletedAt) || now : null;
    }
    const saved = await this.projectModel
      .findOneAndUpdate(filter, { $set, $setOnInsert: { createdAt: now } }, { new: true, upsert: true, setDefaultsOnInsert: true })
      .select(SUMMARY)
      .lean();
    return saved as unknown as ProjectSummaryRecord;
  }

  /** update folder / trash state / name without re-uploading pixel data */
  async updateMeta(ownerId: string, dto: ProjectMetaDto) {
    if (!dto?.clientId) throw new BadRequestException("Thiếu clientId");
    const $set: Record<string, unknown> = { updatedAt: Date.now() };
    if (dto.name !== undefined) $set.name = String(dto.name).slice(0, 120);
    if (dto.folderId !== undefined) $set.folderId = dto.folderId || null;
    if (dto.deleted !== undefined) {
      $set.deleted = !!dto.deleted;
      $set.deletedAt = dto.deleted ? Number(dto.deletedAt) || Date.now() : null;
    }
    const doc = await this.projectModel
      .findOneAndUpdate({ ownerId: new Types.ObjectId(ownerId), clientId: dto.clientId }, { $set }, { new: true })
      .select(SUMMARY)
      .lean();
    if (!doc) throw new NotFoundException("Project chưa có trên Cloud");
    return doc;
  }

  async getByClientId(ownerId: string, clientId: string) {
    const doc = await this.projectModel.findOne({ ownerId: new Types.ObjectId(ownerId), clientId }).lean();
    if (!doc) throw new NotFoundException("Không tìm thấy project");
    return doc;
  }

  async removeByClientId(ownerId: string, clientId: string) {
    await this.projectModel.deleteOne({ ownerId: new Types.ObjectId(ownerId), clientId });
    return { ok: true };
  }

  private async findOwned(ownerId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException();
    const doc = await this.projectModel.findById(id);
    if (!doc) throw new NotFoundException("Không tìm thấy project");
    if (doc.ownerId.toString() !== ownerId) throw new ForbiddenException();
    return doc;
  }

  async getMine(ownerId: string, id: string) {
    return (await this.findOwned(ownerId, id)).toObject();
  }

  async remove(ownerId: string, id: string) {
    const doc = await this.findOwned(ownerId, id);
    await doc.deleteOne();
    return { ok: true };
  }

  async setPublished(ownerId: string, id: string, body: { published: boolean; description?: string; tags?: string[] }) {
    const doc = await this.findOwned(ownerId, id);
    const now = Date.now();
    doc.published = !!body.published;
    doc.updatedAt = now;
    if (doc.published) doc.publishedAt = now;
    if (typeof body.description === "string") doc.description = body.description.slice(0, 500);
    if (Array.isArray(body.tags)) doc.tags = body.tags.map((t) => String(t).trim().toLowerCase().slice(0, 30)).filter(Boolean).slice(0, 10);
    await doc.save();
    const { data: _data, ...rest } = doc.toObject();
    void _data;
    return rest;
  }

  listPublic() {
    return this.projectModel.find({ published: true, deleted: false }).select(SUMMARY).sort({ publishedAt: -1, updatedAt: -1 }).limit(200).lean();
  }

  async getPublic(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException();
    const doc = await this.projectModel.findOneAndUpdate({ _id: id, published: true }, { $inc: { downloads: 1 } }, { new: true }).lean();
    if (!doc) throw new NotFoundException("Sprite không tồn tại hoặc chưa công khai");
    return doc;
  }
}
