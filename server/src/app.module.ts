import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ProjectsModule } from "./projects/projects.module";
import { AuthModule } from "./auth/auth.module";
import { FoldersModule } from "./folders/folders.module";

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/pixelforge"),
    AuthModule,
    ProjectsModule,
    FoldersModule,
  ],
})
export class AppModule {}
