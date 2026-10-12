import { Module } from "@nestjs/common";
import { AuthController } from "@/modules/auth/auth.controller.js";
import { NestAuthService } from "@/modules/auth/services/auth.service.js";
import { NestPasswordService } from "@/modules/auth/services/password.service.js";
import { PasswordResetService } from "@/modules/auth/services/password-reset.service.js";
import { NestTokenService } from "@/modules/auth/services/token.service.js";
import { SessionTokenService } from "@/modules/auth/services/session-token.service.js";
import { LogoutService } from "@/modules/auth/services/logout.service.js";
import { EmailVerificationService } from "@/modules/auth/services/email-verification.service.js";

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
