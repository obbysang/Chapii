import { Module } from "@nestjs/common";
import { ChainClient } from "../chain/chain.client";
import { EventsService } from "../events.service";
import { PrismaService } from "../prisma.service";
import { IndexerService } from "./indexer.service";
import { VaultsController } from "./vaults.controller";

@Module({
  providers: [PrismaService, ChainClient, EventsService, IndexerService],
  controllers: [VaultsController],
  exports: [PrismaService, EventsService],
})
export class VaultsModule {}
