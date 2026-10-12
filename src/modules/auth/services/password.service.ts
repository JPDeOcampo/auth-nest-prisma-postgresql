import { Inject, Injectable } from "@nestjs/common";
import { PasswordResetService } from "@/modules/auth/services/password-reset.service.js";
import type {
  ResendResetPasswordDTO,
  ResetPasswordDTO,
  UpdatePasswordDTO,
  VerifyResetPasswordDTO,
} from "@/common/types/password.types.js";

@Injectable()
export class NestPasswordService {
  constructor(
    @Inject(PasswordResetService)
    private readonly passwordResetService: PasswordResetService,
  ) {}

  updatePassword(payload: UpdatePasswordDTO) {
    return this.passwordResetService.updatePassword(payload);
  }

  forgotPassword(payload: { email: string; ipAddress?: string; userAgent?: string }) {
    return this.passwordResetService.forgotPassword(payload);
  }

  verifyResetPassword(
    payload: VerifyResetPasswordDTO,
  ) {
    return this.passwordResetService.verifyResetPassword(payload);
  }

  resendResetPassword(
    payload: ResendResetPasswordDTO,
  ) {
    return this.passwordResetService.resendResetPassword(payload);
  }

  refreshResetPassword(
    payload: { signToken: string; expiresAt: number },
  ) {
    return this.passwordResetService.refreshResetPassword(payload);
  }

  resetPassword(payload: ResetPasswordDTO) {
    return this.passwordResetService.resetPassword(payload);
  }
}
