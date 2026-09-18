import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ProjectsService, UpsertProjectDto } from "./projects.service";
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
  upsert(@CurrentUser() user: JwtPayload, @Body() body: UpsertProjectDto) {
    return this.projects.upsert(user.sub, user.name, body);
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
