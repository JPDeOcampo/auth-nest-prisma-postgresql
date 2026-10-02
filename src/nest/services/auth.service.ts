import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "@/nest/errors/app-error.js";
import { PrismaService } from "@/nest/infrastructure/prisma.service.js";
import { LogoutService } from "@/nest/services/logout.service.js";
import { EmailVerificationService } from "@/nest/services/email-verification.service.js";
import { hashPassword, verifyPassword } from "@/nest/utils/password-hashing.js";
import { randomColorHex } from "@/nest/utils/colors.js";
import { USER_SELECT } from "@/nest/constants/prisma-selects.constant.js";
import type {
  LoginUserDTO,
  OAuthProviderDTO,
  RegisterUserDTO,
} from "@/nest/types/auth.types.js";
import { SessionTokenService } from "@/nest/services/session-token.service.js";
import { FirebaseService } from "@/nest/infrastructure/firebase.service.js";

@Injectable()
export class NestAuthService {
  constructor(
    @Inject(LogoutService) private readonly logoutService: LogoutService,
    @Inject(EmailVerificationService)
    private readonly emailVerificationService: EmailVerificationService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionTokenService)
    private readonly sessionTokenService: SessionTokenService,
    @Inject(FirebaseService) private readonly firebase: FirebaseService,
  ) {}

  async register(payload: RegisterUserDTO) {
    const { firstName, lastName, email, password, ipAddress, userAgent } =
      payload;
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new AppError("The email is already registered.", 400, "email");
    }

    const passwordHash = await hashPassword(password);
    const user = await this.prisma.user.create({
      data: {
        firstName,
        lastName,
        email: normalizedEmail,
        loginCount: 0,
        accounts: {
          create: {
            provider: "LOCAL",
            providerAccountId: normalizedEmail,
            passwordHash,
          },
        },
        profile: {
          create: {
            profileType: "COLOR",
            profileValue: randomColorHex(),
          },
        },
        settings: {
          create: {},
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        loginCount: true,
      },
    });

    return this.emailVerificationService.send(user, ipAddress, userAgent);
  }

  async login(credentials: LoginUserDTO) {
    const { email, password, ipAddress, userAgent } = credentials;
    const normalizedEmail = email.toLowerCase().trim();
    const authError = new AppError("Invalid email or password.", 401);

    const account = await this.prisma.account.findFirst({
      where: {
        provider: "LOCAL",
        providerAccountId: normalizedEmail,
      },
      include: { user: true },
    });

    if (!account?.user) {
      throw authError;
    }

    const user = account.user;
    const now = new Date();

    if (user.status !== "ACTIVE") {
      throw new AppError("Account is not active.", 403);
    }

    if (user.lockoutUntil && user.lockoutUntil > now) {
      const minutesLeft = Math.ceil(
        (user.lockoutUntil.getTime() - now.getTime()) / 60_000,
      );
      throw new AppError(
        `Too many failed attempts. Try again in ${minutesLeft} minute(s).`,
        403,
      );
    }

    if (user.lockoutUntil && user.lockoutUntil <= now) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: 0, lockoutUntil: null },
      });
    }

    if (user.emailStatus === "UNVERIFIED" && user.loginCount === 0) {
      const token = await this.prisma.authToken.findFirst({
        where: {
          userId: user.id,
          type: "EMAIL_VERIFICATION",
          usedAt: null,
          revokedAt: null,
        },
      });

      if (!token || token.expiresAt < now) {
        if (token) {
          await this.prisma.authToken.update({
            where: { id: token.id },
            data: { revokedAt: now },
          });
        }

        await this.emailVerificationService.send(user, ipAddress, userAgent);
        throw new AppError(
          "A new verification email has been sent. Please check your inbox and verify your email before logging in.",
          403,
        );
      }

      throw new AppError(
        "A valid verification link was already sent recently. Please check your spam folder or try again later.",
        403,
      );
    }

    if (!account.passwordHash) {
      throw authError;
    }

    const isValid = await verifyPassword(password, account.passwordHash);
    if (!isValid) {
      const maxAttempts = 5;
      const newAttempts = user.loginAttempts + 1;
      const attemptsLeft = maxAttempts - newAttempts;
      const lockoutUntil =
        newAttempts >= maxAttempts
          ? new Date(Date.now() + 15 * 60 * 1000)
          : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: { increment: 1 },
          lockoutUntil,
        },
      });

      if (newAttempts >= maxAttempts) {
        throw new AppError(
          "Too many failed attempts. Account locked for 15 minutes.",
          403,
        );
      }

      throw new AppError(
        `Invalid email or password. ${attemptsLeft} attempt(s) left.`,
        401,
      );
    }

    const { accessToken, refreshToken } =
      await this.sessionTokenService.generateAuthTokens(user.id);
    await this.sessionTokenService.createSession(user.id, refreshToken);

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        loginCount: { increment: 1 },
        loginAttempts: 0,
        lockoutUntil: null,
        lastLoginAt: new Date(),
      },
      select: USER_SELECT,
    });

    return { user: updatedUser, accessToken, refreshToken };
  }

  async oauthLogin({
    idToken,
    provider,
  }: {
    idToken: string;
    provider: OAuthProviderDTO;
  }) {
    const decoded = await this.firebase.auth().verifyIdToken(idToken);
    const { uid, email, name, picture, email_verified: emailVerified } = decoded;

    if (!email) {
      throw new AppError("OAuth account email not found.", 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, status: true },
    });

    if (!user) {
      const nameParts = (name ?? "").split(" ");
      user = await this.prisma.user.create({
        data: {
          firstName: nameParts[0] || "User",
          lastName: nameParts.slice(1).join(" "),
          email: normalizedEmail,
          emailStatus: emailVerified ? "VERIFIED" : "UNVERIFIED",
          loginCount: 0,
          accounts: {
            create: {
              provider,
              providerAccountId: uid,
            },
          },
          profile: {
            create: {
              profileType: picture ? "IMAGE" : "COLOR",
              profileValue: picture || randomColorHex(),
            },
          },
          settings: { create: {} },
        },
        select: { id: true, status: true },
      });
    }

    if (user.status !== "ACTIVE") {
      throw new AppError("Account is not active.", 403);
    }

    const existingAccount = await this.prisma.account.findFirst({
      where: { userId: user.id, provider },
    });

    if (!existingAccount) {
      await this.prisma.account.create({
        data: {
          userId: user.id,
          provider,
          providerAccountId: uid,
        },
      });
    } else if (existingAccount.providerAccountId !== uid) {
      await this.prisma.account.update({
        where: { id: existingAccount.id },
        data: { providerAccountId: uid },
      });
    }

    if (emailVerified) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailStatus: "VERIFIED" },
      });
    }

    const { accessToken, refreshToken } =
      await this.sessionTokenService.generateAuthTokens(user.id);
    await this.sessionTokenService.createSession(user.id, refreshToken);

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        loginCount: { increment: 1 },
        lastLoginAt: new Date(),
      },
      select: USER_SELECT,
    });

    return { user: updatedUser, accessToken, refreshToken };
  }

  async updateEmail(
    userId: string,
    payload: { email: string; ipAddress?: string; userAgent?: string },
  ) {
    const { email, ipAddress, userAgent } = payload;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });

    if (!currentUser) {
      throw new AppError("User not found.", 404);
    }

    if (!email) {
      throw new AppError("Email is required.", 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (currentUser.email === normalizedEmail) {
      throw new AppError(
        "The email is already in use. Please use a different email.",
        400,
      );
    }

    if (existingUser && existingUser.id !== userId) {
      throw new AppError("The email is already taken.", 400);
    }

    const emailChangeRequest = await this.prisma.emailChangeRequest.create({
      data: {
        newEmail: normalizedEmail,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        user: { connect: { id: userId } },
      },
      select: {
        id: true,
        userId: true,
        newEmail: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    const expiresAt = await this.emailVerificationService.send(
      {
        id: userId,
        email: normalizedEmail,
        firstName: currentUser.firstName,
        loginCount: currentUser.loginCount,
      },
      ipAddress,
      userAgent,
    );

    return {
      emailChangeRequest,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async removeNewEmail(userId: string, email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const authToken = await this.prisma.authToken.findFirst({
      where: {
        userId,
        type: "EMAIL_VERIFICATION",
        usedAt: null,
        revokedAt: null,
      },
    });

    if (!authToken) {
      throw new AppError("No email verification token found.", 404);
    }

    await this.prisma.authToken.delete({ where: { id: authToken.id } });
    return this.prisma.emailChangeRequest.delete({
      where: { userId, newEmail: normalizedEmail },
    });
  }

  resendVerificationEmail(
    userId: string,
    email: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.emailVerificationService.resend(
      userId,
      email,
      ipAddress,
      userAgent,
    );
  }

  verifyEmail(token: string) {
    return this.emailVerificationService.verify(token);
  }

  async deleteAccount({
    userId,
    password,
    idToken,
  }: {
    userId: string;
    password?: string;
    idToken?: string;
  }) {
    const account = await this.prisma.account.findFirst({
      where: { userId, provider: "LOCAL" },
      select: { id: true, passwordHash: true },
    });

    if (account?.passwordHash) {
      if (!password) {
        throw new AppError("Password is required.", 400);
      }

      const isValid = await verifyPassword(password, account.passwordHash);
      if (!isValid) {
        throw new AppError("Incorrect password.", 401);
      }
    } else {
      if (!idToken) {
        throw new AppError("Re-authentication required.", 401);
      }

      const decoded = await this.firebase.auth().verifyIdToken(idToken);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          accounts: { select: { providerAccountId: true } },
        },
      });
      const hasMatchingAccount = user?.accounts.some(
        (linkedAccount) => linkedAccount.providerAccountId === decoded.uid,
      );

      if (!user || !hasMatchingAccount) {
        throw new AppError(
          "Unauthorized account, please select a different account.",
          401,
        );
      }

      const authTime = decoded.auth_time * 1000;
      if (Date.now() - authTime > 5 * 60 * 1000) {
        throw new AppError("Recent login required.", 401);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId } });
      return tx.user.delete({ where: { id: userId } });
    });
  }

  logout(token: string) {
    return this.logoutService.userSingleLogout(token);
  }

  logoutAllDevices(userId: string | undefined) {
    return this.logoutService.logoutAllDevices(userId);
  }
}
