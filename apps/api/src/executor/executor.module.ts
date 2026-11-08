import { Module, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { IntentsModule } from "../intents/intents.module";
import { ExecutorService } from "./executor.service";

@Module({ imports: [IntentsModule], providers: [PrismaService, ExecutorService], exports: [ExecutorService] })
export class ExecutorModule implements OnModuleInit {
  constructor(private readonly exec: ExecutorService) {}

  onModuleInit(): void {
    this.exec.start();
  }
}
