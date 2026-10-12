import { Global, Module } from "@nestjs/common";
import { FirebaseService } from "@/infrastructure/firebase/firebase.service.js";
import { MailerService } from "@/infrastructure/mailer/mailer.service.js";
import { PrismaService } from "@/infrastructure/prisma/prisma.service.js";
import { RedisService } from "@/infrastructure/redis/redis.service.js";
import { TokenInfrastructureService } from "@/infrastructure/token/token.service.js";

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
