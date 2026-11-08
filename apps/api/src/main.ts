import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",") });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}
void bootstrap();
