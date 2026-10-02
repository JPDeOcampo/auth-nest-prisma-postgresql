import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { AppError } from "@/nest/errors/app-error.js";
import { MailerService } from "@/nest/infrastructure/mailer.service.js";
import { PrismaService } from "@/nest/infrastructure/prisma.service.js";
import { RedisService } from "@/nest/infrastructure/redis.service.js";
import { TokenInfrastructureService } from "@/nest/infrastructure/token.service.js";
import { resetPasswordTemplate } from "@/nest/infrastructure/mailer/templates/resetPassword.js";
import type {
  RefreshResetPasswordDTO,
  ResendResetPasswordDTO,
  ResetPasswordDTO,
  UpdatePasswordDTO,
  VerifyResetPasswordDTO,
} from "@/nest/types/password.types.js";
import { hashPassword, verifyPassword } from "@/nest/utils/password-hashing.js";
import { maskEmail } from "@/nest/utils/mask-email.js";
import { getRemainingTime } from "@/nest/utils/session.js";

@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(TokenInfrastructureService)
    private readonly tokenInfrastructure: TokenInfrastructureService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async updatePassword({ id, currentPassword, newPassword }: UpdatePasswordDTO) {
    if (!id) {
      throw new AppError("Password account not found.", 404);
    }

    const account = await this.prisma.account.findFirst({
      where: { userId: id, provider: "LOCAL" },
      select: { id: true, passwordHash: true, userId: true },
    });

    if (!account?.passwordHash) {
      throw new AppError("Password account not found.", 404);
    }

    const isMatch = await verifyPassword(currentPassword, account.passwordHash);
    if (!isMatch) {
      throw new AppError("Current password is incorrect.", 401);
    }

    const isSamePassword = await verifyPassword(
      newPassword,
      account.passwordHash,
    );
    if (isSamePassword) {
      throw new AppError("New password cannot be same as old password.", 400);
    }

    const passwordHash = await hashPassword(newPassword);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.account.update({
        where: { id: account.id },
        data: { passwordHash },
      });
      await transaction.refreshToken.deleteMany({ where: { userId: id } });
      await transaction.authToken.deleteMany({
        where: { userId: id, type: "PASSWORD_RESET" },
      });
      return updated;
    });
    await this.redis.clearResetChallengesForUser(id);
    return updated;
  }

  async forgotPassword(data: {
    email: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const { email, ipAddress, userAgent } = data;
    const normalizedEmail = email.toLowerCase().trim();
    const mockExpiresIn = 2 * 60;
    const mockSignTokenExpiresIn = 5 * 60;
    const mockNow = Date.now();
    const mockExpiresAt = mockNow + mockExpiresIn * 1000;
    const challengeId = randomUUID();
    const mockSubjectId = randomUUID();
    const mockSignToken = await this.tokenInfrastructure.sign({
      id: challengeId,
      type: "access",
      purpose: "password-reset",
      maskedEmail: maskEmail(normalizedEmail),
      expiresIn: mockSignTokenExpiresIn,
    });

    const mockResponse = {
      newSignToken: mockSignToken,
      signTokenExpiresAt: mockNow + mockSignTokenExpiresIn * 1000,
      expiresIn: mockExpiresIn,
      expiresAt: mockExpiresAt,
      userId: challengeId,
      email: maskEmail(normalizedEmail),
    };

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) {
      await this.redis.registerResetChallenge(
        challengeId,
        mockSubjectId,
        mockSignTokenExpiresIn + 60,
      );
      return mockResponse;
    }

    const localAccount = await this.prisma.account.findFirst({
      where: { userId: user.id, provider: "LOCAL" },
    });
    if (!localAccount?.passwordHash) {
      await this.redis.registerResetChallenge(
        challengeId,
        mockSubjectId,
        mockSignTokenExpiresIn + 60,
      );
      return mockResponse;
    }

    const reset = await this.sendResetPasswordOtp({
      id: user.id,
      firstName: user.firstName,
      email: user.email,
      challengeId,
      maskedEmail: maskEmail(normalizedEmail),
      ipAddress,
      userAgent,
    });

    return {
      ...reset,
      userId: challengeId,
      email: maskEmail(normalizedEmail),
    };
  }

  async verifyResetPassword({ signToken, userId, otp }: VerifyResetPasswordDTO) {
    const challenge = this.checkSignToken(signToken, userId);
    if (!userId || !otp) {
      throw new AppError("User ID and OTP are required", 400);
    }
    const actualUserId = await this.redis.resolveResetChallenge(
      challenge.challengeId,
    );

    const attemptKey = this.redis.key(
      "otp-attempts",
      createHash("sha256")
        .update(actualUserId ?? challenge.challengeId)
        .digest("hex"),
    );
    const attempts = await this.redis.incrementAttempt(attemptKey, 10 * 60);
    if (attempts > 5) {
      throw new AppError("Too many invalid verification attempts", 429);
    }
    if (!actualUserId) {
      throw new AppError("Invalid or expired verification code", 400);
    }

    const { hashedToken } = this.tokenInfrastructure.generateSecureToken({
      token: otp,
      usePepper: true,
    });
    const token = await this.prisma.authToken.findFirst({
      where: {
        userId: actualUserId,
        type: "PASSWORD_RESET",
        tokenHash: hashedToken,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!token) {
      throw new AppError("Invalid or expired verification code", 400);
    }

    const consumed = await this.prisma.authToken.updateMany({
      where: {
        id: token.id,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new AppError("Invalid or expired verification code", 400);
    }
    await this.redis.clearAttempt(attemptKey);

    const resetToken = await this.tokenInfrastructure.sign({
      id: challenge.challengeId,
      type: "access",
      purpose: "password-reset",
      maskedEmail: challenge.maskedEmail,
      expiresIn: "2m",
    });
    await this.redis.registerOneTimeToken(
      resetToken,
      challenge.challengeId,
      2 * 60,
    );
    return resetToken;
  }

  async resetPassword({ signToken, userId, newPassword }: ResetPasswordDTO) {
    if (!signToken) {
      throw new AppError("Invalid or expired session.", 400);
    }
    const resetToken = this.checkSignToken(signToken, userId);
    if (!userId || !newPassword) {
      throw new AppError("Missing required fields", 400);
    }
    const actualUserId = await this.redis.resolveResetChallenge(resetToken.challengeId);
    if (!actualUserId) {
      throw new AppError("Invalid or expired session.", 400);
    }

    const account = await this.prisma.account.findFirst({
      where: { userId: actualUserId, provider: "LOCAL" },
    });
    if (!account?.passwordHash) {
      throw new AppError("Password account not found", 404);
    }

    if (
      !resetToken.iat ||
      Math.floor(account.updatedAt.getTime() / 1000) > resetToken.iat
    ) {
      throw new AppError("Invalid or expired session.", 400);
    }

    const passwordHash = await hashPassword(newPassword);
    if (
      !(await this.redis.consumeOneTimeToken(
        signToken,
        resetToken.challengeId,
      ))
    ) {
      throw new AppError("Invalid or expired session.", 400);
    }
    const result = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.account.updateMany({
        where: { id: account.id, updatedAt: account.updatedAt },
        data: { passwordHash },
      });
      if (updated.count !== 1) {
        throw new AppError("Invalid or expired session.", 400);
      }

      await transaction.refreshToken.deleteMany({
        where: { userId: actualUserId },
      });
      return transaction.authToken.deleteMany({
        where: { userId: actualUserId, type: "PASSWORD_RESET" },
      });
    });
    await this.redis.clearResetChallengesForUser(actualUserId);
    return result;
  }

  async refreshResetPassword({
    signToken,
    expiresAt,
  }: {
    signToken: string;
    expiresAt: number;
  }) {
    const token = this.checkSignToken(signToken);
    const expiresIn = getRemainingTime(expiresAt);
    if (
      !token.challengeId ||
      !(await this.redis.resolveResetChallenge(token.challengeId))
    ) {
      throw new AppError("Invalid or expired session.", 400);
    }

    return {
      userId: token.challengeId,
      expiresIn,
      email: token.maskedEmail,
    };
  }

  async resendResetPassword({
    ipAddress,
    userAgent,
    userId,
    signToken,
  }: ResendResetPasswordDTO) {
    const challenge = this.checkSignToken(signToken, userId);
    if (!userId) {
      throw new AppError("Invalid or expired session.", 400);
    }

    const actualUserId = await this.redis.resolveResetChallenge(
      challenge.challengeId,
    );
    if (!actualUserId) {
      throw new AppError("Invalid or expired session.", 400);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: actualUserId },
    });
    if (!user) {
      await this.redis.registerResetChallenge(
        challenge.challengeId,
        actualUserId,
        6 * 60,
      );
      return this.createResetChallengeResponse(challenge);
    }

    await this.redis.clearResetChallengesForUser(user.id);
    await this.prisma.authToken.deleteMany({
      where: { userId: user.id, type: "PASSWORD_RESET" },
    });

    return this.sendResetPasswordOtp({
      id: user.id,
      firstName: user.firstName,
      email: user.email,
      challengeId: challenge.challengeId,
      maskedEmail: challenge.maskedEmail,
      ipAddress,
      userAgent,
    });
  }

  private checkSignToken(
    token?: string,
    expectedChallengeId?: string,
  ): RefreshResetPasswordDTO {
    if (!token) {
      throw new AppError("Invalid or expired session.", 400);
    }

    try {
      const decoded = this.tokenInfrastructure.verifySignToken(token);
      if (expectedChallengeId && decoded.challengeId !== expectedChallengeId) {
        throw new AppError("Invalid or expired session.", 400);
      }
      return decoded;
    } catch {
      throw new AppError("Session expired.", 400);
    }
  }

  private async sendResetPasswordOtp(user: {
    id: string;
    firstName: string;
    email: string;
    challengeId: string;
    maskedEmail: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const expiresIn = 2 * 60;
    const expiresAt = Date.now() + expiresIn * 1000;
    const signTokenExpiresIn = 5 * 60;
    const signTokenExpiresAt = Date.now() + signTokenExpiresIn * 1000;
    const otp = randomInt(100000, 1000000).toString();
    const otpExpiresAt = new Date(Date.now() + expiresIn * 1000);
    const { hashedToken } = this.tokenInfrastructure.generateSecureToken({
      token: otp,
      usePepper: true,
    });

    await this.prisma.authToken.create({
      data: {
        tokenHash: hashedToken,
        type: "PASSWORD_RESET",
        expiresAt: otpExpiresAt,
        userId: user.id,
        ipAddress: user.ipAddress,
        userAgent: user.userAgent,
      },
    });

    const sent = await this.mailer.send({
      to: user.email,
      subject: "Password Reset Request",
      html: resetPasswordTemplate({
        firstName: user.firstName,
        resetCode: otp,
      }),
    });
    if (!sent) {
      throw new AppError("Failed to send reset email", 500);
    }

    const newSignToken = await this.tokenInfrastructure.sign({
      id: user.challengeId,
      type: "access",
      purpose: "password-reset",
      maskedEmail: user.maskedEmail,
      expiresIn: signTokenExpiresIn,
    });
    await this.redis.registerResetChallenge(
      user.challengeId,
      user.id,
      signTokenExpiresIn + 60,
    );

    return { newSignToken, signTokenExpiresAt, expiresAt, expiresIn };
  }

  private async createResetChallengeResponse(
    challenge: RefreshResetPasswordDTO,
  ) {
    const expiresIn = 2 * 60;
    const signTokenExpiresIn = 5 * 60;
    const now = Date.now();
    const newSignToken = await this.tokenInfrastructure.sign({
      id: challenge.challengeId,
      type: "access",
      purpose: "password-reset",
      maskedEmail: challenge.maskedEmail,
      expiresIn: signTokenExpiresIn,
    });
    return {
      newSignToken,
      signTokenExpiresAt: now + signTokenExpiresIn * 1000,
      expiresAt: now + expiresIn * 1000,
      expiresIn,
    };
  }
}
