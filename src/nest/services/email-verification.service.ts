import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "@/nest/errors/app-error.js";
import { PrismaService } from "@/nest/infrastructure/prisma.service.js";
import { MailerService } from "@/nest/infrastructure/mailer.service.js";
import { TokenInfrastructureService } from "@/nest/infrastructure/token.service.js";
import { verifyEmailTemplate } from "@/nest/infrastructure/mailer/templates/verifyEmail.js";

export interface VerificationUser {
  id: string;
  email: string;
  firstName: string;
  loginCount?: number;
}

@Injectable()
export class EmailVerificationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(TokenInfrastructureService)
    private readonly tokenInfrastructure: TokenInfrastructureService,
  ) {}

  async send(
    user: VerificationUser,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const { token, hashedToken, expiresAt } =
      await this.tokenInfrastructure.generateSecureToken();

    const existingToken = await this.prisma.authToken.findFirst({
      where: {
        userId: user.id,
        type: "EMAIL_VERIFICATION",
        usedAt: null,
        revokedAt: null,
      },
    });

    if (existingToken) {
      await this.prisma.authToken.update({
        where: { id: existingToken.id },
        data: { tokenHash: hashedToken, expiresAt, ipAddress, userAgent },
      });
    } else {
      await this.prisma.authToken.create({
        data: {
          userId: user.id,
          type: "EMAIL_VERIFICATION",
          tokenHash: hashedToken,
          expiresAt,
          ipAddress,
          userAgent,
        },
      });
    }

    const verificationLink =
      `${process.env.BACKEND_URL}/api/v1/auth/verify-email?token=${token}`;

    const emailSent = await this.mailer.send({
      to: user.email,
      subject: "Verify Your Email",
      html: verifyEmailTemplate({
        firstName: user.firstName,
        verificationLink,
        loginCount: user.loginCount,
      }),
    });

    if (!emailSent) {
      throw new AppError("Failed to send verification email", 500);
    }

    return expiresAt;
  }

  async verify(token: string) {
    const { hashedToken } = this.tokenInfrastructure.generateSecureToken({
      token,
    });

    const authToken = await this.prisma.authToken.findFirst({
      where: {
        tokenHash: hashedToken,
        type: "EMAIL_VERIFICATION",
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!authToken) {
      return false;
    }

    const emailChangeRequest = await this.prisma.emailChangeRequest.findFirst({
      where: { userId: authToken.user.id },
    });

    if (emailChangeRequest) {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: authToken.user.id },
          data: { email: emailChangeRequest.newEmail },
        }),
        this.prisma.account.update({
          where: {
            userId_provider: {
              userId: authToken.user.id,
              provider: "LOCAL",
            },
          },
          data: { providerAccountId: emailChangeRequest.newEmail },
        }),
        this.prisma.authToken.delete({ where: { id: authToken.id } }),
        this.prisma.emailChangeRequest.delete({
          where: {
            userId: authToken.user.id,
            newEmail: emailChangeRequest.newEmail,
          },
        }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: authToken.user.id },
          data: { emailStatus: "VERIFIED" },
        }),
        this.prisma.authToken.delete({ where: { id: authToken.id } }),
      ]);
    }

    return true;
  }

  async resend(
    userId: string,
    email: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!account) {
      throw new AppError("Account not found. Please try logging in again.", 401);
    }

    const existingToken = await this.prisma.authToken.findFirst({
      where: {
        userId,
        type: "EMAIL_VERIFICATION",
        usedAt: null,
        revokedAt: null,
      },
    });

    if (existingToken && existingToken.expiresAt > new Date()) {
      throw new AppError(
        "A valid verification link was already sent recently. Please check your spam folder or try again later.",
        429,
      );
    }

    if (existingToken) {
      await this.prisma.authToken.update({
        where: { id: existingToken.id },
        data: { revokedAt: new Date() },
      });
    }

    const expiresAt = await this.send(
      {
        id: account.id,
        email: email.toLowerCase().trim(),
        firstName: account.firstName,
        loginCount: account.loginCount,
      },
      ipAddress,
      userAgent,
    );

    return expiresAt.toISOString();
  }
}
