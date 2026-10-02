import { Module } from "@nestjs/common";
import { AuthController } from "@/nest/auth/auth.controller.js";
import { NestAuthService } from "@/nest/services/auth.service.js";
import { NestPasswordService } from "@/nest/services/password.service.js";
import { PasswordResetService } from "@/nest/services/password-reset.service.js";
import { NestTokenService } from "@/nest/services/token.service.js";
import { SessionTokenService } from "@/nest/services/session-token.service.js";
import { LogoutService } from "@/nest/services/logout.service.js";
import { EmailVerificationService } from "@/nest/services/email-verification.service.js";

@Module({
  controllers: [AuthController],
  providers: [
    NestAuthService,
    NestPasswordService,
    PasswordResetService,
    NestTokenService,
    SessionTokenService,
    LogoutService,
    EmailVerificationService,
  ],
})
export class AuthModule {}
