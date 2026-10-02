import { Module } from "@nestjs/common";
import { AuthModule } from "@/nest/auth/auth.module.js";
import { InfrastructureModule } from "@/nest/infrastructure/infrastructure.module.js";
import { HealthModule } from "@/nest/health/health.module.js";
import { UserModule } from "@/nest/user/user.module.js";

@Module({
  imports: [InfrastructureModule, AuthModule, UserModule, HealthModule],
})
export class AppModule {}
