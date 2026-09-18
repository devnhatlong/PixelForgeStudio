import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true });
  // project documents can be several MB (pixel data + thumbnails)
  app.useBodyParser("json", { limit: "12mb" });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`PixelForge API listening on http://localhost:${port}/api/v1`);
}
bootstrap();
