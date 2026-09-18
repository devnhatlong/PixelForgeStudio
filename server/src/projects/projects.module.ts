import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Project, ProjectSchema } from "./project.schema";
import { MarketplaceController, ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [MongooseModule.forFeature([{ name: Project.name, schema: ProjectSchema }]), AuthModule],
  controllers: [ProjectsController, MarketplaceController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
