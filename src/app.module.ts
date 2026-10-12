import { Module } from "@nestjs/common";
import { AuthModule } from "@/modules/auth/auth.module.js";
import { InfrastructureModule } from "@/infrastructure/infrastructure.module.js";
import { HealthModule } from "@/modules/health/health.module.js";
import { UserModule } from "@/modules/user/user.module.js";

@Module({
  imports: [InfrastructureModule, AuthModule, UserModule, HealthModule],
})
export class AppModule {}
