import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { VaultsModule } from "./vaults/vaults.module";

@Module({
  imports: [VaultsModule],
  controllers: [HealthController],
})
export class AppModule {}
