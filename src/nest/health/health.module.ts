import { Module } from "@nestjs/common";
import { HealthController } from "@/nest/health/health.controller.js";

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
