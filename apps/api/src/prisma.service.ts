import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch {
      /* db optional at boot; health endpoint reports status */
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
