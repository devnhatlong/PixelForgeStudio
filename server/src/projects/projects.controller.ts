import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ProjectMetaDto, ProjectsService, ProjectSummaryRecord, UpsertProjectDto } from "./projects.service";
import { AuthGuard, CurrentUser, JwtPayload } from "../auth/auth.guard";

@Controller("projects")
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.projects.listMine(user.sub);
  }

  @Post()
  upsert(@CurrentUser() user: JwtPayload, @Body() body: UpsertProjectDto): Promise<ProjectSummaryRecord> {
    return this.projects.upsert(user.sub, user.name, body);
  }

  /** folder / trash / rename without pixel data */
  @Patch("meta")
  meta(@CurrentUser() user: JwtPayload, @Body() body: ProjectMetaDto) {
    return this.projects.updateMeta(user.sub, body);
  }

  @Get("by-client/:clientId")
  getByClient(@CurrentUser() user: JwtPayload, @Param("clientId") clientId: string) {
    return this.projects.getByClientId(user.sub, clientId);
  }

  @Delete("by-client/:clientId")
  removeByClient(@CurrentUser() user: JwtPayload, @Param("clientId") clientId: string) {
    return this.projects.removeByClientId(user.sub, clientId);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.projects.getMine(user.sub, id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.projects.remove(user.sub, id);
  }

  @Patch(":id/publish")
  publish(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() body: { published: boolean; description?: string; tags?: string[] }) {
    return this.projects.setPublished(user.sub, id, body ?? { published: false });
  }
}

@Controller("marketplace")
export class MarketplaceController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list() {
    return this.projects.listPublic();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.projects.getPublic(id);
  }
}
