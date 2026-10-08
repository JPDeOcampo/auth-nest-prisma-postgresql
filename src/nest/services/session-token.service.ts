import { Inject, Injectable } from "@nestjs/common";
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { randomUUID } from "node:crypto";
import { PrismaService } from "@/nest/infrastructure/prisma.service.js";
import { TokenInfrastructureService } from "@/nest/infrastructure/token.service.js";
import { AppError } from "@/nest/errors/app-error.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 5;

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

@Injectable()
export class SessionTokenService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenInfrastructureService)
    private readonly tokenInfrastructure: TokenInfrastructureService,
  ) {}

  async createSession(
    userId: string,
    refreshToken: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({
        where: { userId, expiresAt: { lt: new Date() } },
      });
      await tx.refreshToken.create({
        data: {
          tokenHash,
          familyId: randomUUID(),
          userId,
          expiresAt,
          ipAddress: meta?.ipAddress ?? null,
          userAgent: meta?.userAgent ?? null,
        },
      });

      const sessions = await tx.refreshToken.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (sessions.length > MAX_SESSIONS) {
        await tx.refreshToken.deleteMany({
          where: { id: { in: sessions.slice(MAX_SESSIONS).map((s) => s.id) } },
        });
      }
    });
  }

  generateAuthTokens(userId: string) {
    return Promise.all([
      this.tokenInfrastructure.sign({
        id: userId,
        type: "access",
        expiresIn: "15m",
      }),
      this.tokenInfrastructure.sign({
        id: userId,
        type: "refresh",
        expiresIn: "7d",
      }),
    ]).then(([accessToken, refreshToken]) => ({ accessToken, refreshToken }));
  }

  async refreshToken(token: string) {
    if (!token) {
      throw new AppError("No refresh token", 401);
    }

    let decoded: JwtPayload;
    try {
      const verified = jwt.verify(token, process.env.JWT_REFRESH_SECRET!);
      if (typeof verified !== "object" || verified === null) {
        throw new Error("Invalid refresh token payload");
      }
      decoded = verified;
    } catch {
      throw new AppError("Invalid or session expired.", 401);
    }
    if (
      typeof decoded.id !== "string" ||
      decoded.purpose !== "auth" ||
      typeof decoded.iat !== "number" ||
      typeof decoded.exp !== "number"
    ) {
      throw new AppError("Invalid or session expired.", 401);
    }

    const tokenHash = hashToken(token);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.userId !== decoded.id) {
      // Unknown token presented for a known user -> possible theft:
      // revoke all of that user's sessions (preserves old behaviour).
      if (decoded.id) {
        await this.prisma.refreshToken.deleteMany({
          where: { userId: decoded.id },
        });
      }
      throw new AppError(
        "Security alert: Session compromised. Please login again.",
        403,
      );
    }

    const now = new Date();
    if (stored.revokedAt || stored.expiresAt <= now) {
      // Reuse of a rotated/expired token -> revoke the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      throw new AppError(
        "Security alert: Session compromised. Please login again.",
        403,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      include: {
        accounts: true,
        emailChangeRequest: true,
        profile: true,
        settings: true,
      },
    });

    if (!user) {
      await this.prisma.refreshToken.deleteMany({
        where: { familyId: stored.familyId },
      });
      throw new AppError(
        "Security alert: Session compromised. Please login again.",
        403,
      );
    }

    const [newAccessToken, newRefreshToken] = await Promise.all([
      this.tokenInfrastructure.sign({
        id: user.id,
        type: "access",
        expiresIn: "15m",
      }),
      this.tokenInfrastructure.sign({
        id: user.id,
        type: "refresh",
        expiresIn: "7d",
      }),
    ]);
    const newTokenHash = hashToken(newRefreshToken);
    const newId = randomUUID();

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: now, replacedById: newId },
      }),
      this.prisma.refreshToken.create({
        data: {
          id: newId,
          tokenHash: newTokenHash,
          familyId: stored.familyId,
          userId: user.id,
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
          ipAddress: stored.ipAddress,
          userAgent: stored.userAgent,
        },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId: user.id, expiresAt: { lt: new Date() } },
      }),
    ]);

    return { user, newAccessToken, newRefreshToken };
  }
}
