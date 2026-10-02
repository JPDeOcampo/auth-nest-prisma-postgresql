import { Global, Module } from "@nestjs/common";
import { FirebaseService } from "@/nest/infrastructure/firebase.service.js";
import { MailerService } from "@/nest/infrastructure/mailer.service.js";
import { PrismaService } from "@/nest/infrastructure/prisma.service.js";
import { RedisService } from "@/nest/infrastructure/redis.service.js";
import { TokenInfrastructureService } from "@/nest/infrastructure/token.service.js";

@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    MailerService,
    FirebaseService,
    TokenInfrastructureService,
  ],
  exports: [
    PrismaService,
    RedisService,
    MailerService,
    FirebaseService,
    TokenInfrastructureService,
  ],
})
export class InfrastructureModule {}
