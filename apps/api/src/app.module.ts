import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { VaultsModule } from "./vaults/vaults.module";
import { IntentsModule } from "./intents/intents.module";
import { ExecutorModule } from "./executor/executor.module";

@Module({
  imports: [VaultsModule, IntentsModule, ExecutorModule],
  controllers: [HealthController],
})
export class AppModule {}
