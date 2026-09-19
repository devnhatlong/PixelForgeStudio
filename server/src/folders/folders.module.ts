import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { InjectModel, MongooseModule } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { AuthGuard, CurrentUser, JwtPayload } from "../auth/auth.guard";
import { AuthModule } from "../auth/auth.module";
import { Folder, FolderDocument, FolderSchema } from "./folder.schema";
import { Project, ProjectDocument, ProjectSchema } from "../projects/project.schema";

@Injectable()
export class FoldersService {
  constructor(
    @InjectModel(Folder.name) private readonly folderModel: Model<FolderDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
  ) {}

  list(ownerId: string) {
    return this.folderModel.find({ ownerId: new Types.ObjectId(ownerId) }).sort({ name: 1 }).lean();
  }

  /** create or rename (upsert by clientId) */
  async upsert(ownerId: string, body: { clientId: string; name: string; createdAt?: number }) {
    if (!body?.clientId || !body.name?.trim()) throw new BadRequestException("Thiếu tên thư mục");
    const now = Date.now();
    return this.folderModel
      .findOneAndUpdate(
        { ownerId: new Types.ObjectId(ownerId), clientId: body.clientId },
        { $set: { name: body.name.trim().slice(0, 80), updatedAt: now }, $setOnInsert: { createdAt: Number(body.createdAt) || now } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .lean();
  }

  /** delete folder; its projects move back to root */
  async remove(ownerId: string, clientId: string) {
    const owner = new Types.ObjectId(ownerId);
    const res = await this.folderModel.deleteOne({ ownerId: owner, clientId });
    if (!res.deletedCount) throw new NotFoundException("Không tìm thấy thư mục");
    await this.projectModel.updateMany({ ownerId: owner, folderId: clientId }, { $set: { folderId: null, updatedAt: Date.now() } });
    return { ok: true };
  }
}

@Controller("folders")
@UseGuards(AuthGuard)
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.folders.list(user.sub);
  }

  @Post()
  upsert(@CurrentUser() user: JwtPayload, @Body() body: { clientId: string; name: string; createdAt?: number }) {
    return this.folders.upsert(user.sub, body);
  }

  @Delete(":clientId")
  remove(@CurrentUser() user: JwtPayload, @Param("clientId") clientId: string) {
    return this.folders.remove(user.sub, clientId);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Folder.name, schema: FolderSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
    AuthModule,
  ],
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}
