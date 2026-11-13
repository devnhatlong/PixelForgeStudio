import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ProjectsModule } from "./projects/projects.module";
import { AuthModule } from "./auth/auth.module";
import { FoldersModule } from "./folders/folders.module";
import { AiModule } from "./ai/ai.module";
import { AssetsModule } from "./assets/assets.module";

@Module({
  imports: [
    // .env is already loaded by load-env.ts (first import in main.ts); this exposes ConfigService
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    MongooseModule.forRoot(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/pixelforge"),
    AuthModule,
    ProjectsModule,
    FoldersModule,
    AiModule,
    AssetsModule,
  ],
})
export class AppModule {}
