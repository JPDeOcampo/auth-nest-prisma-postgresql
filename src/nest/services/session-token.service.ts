import { Inject, Injectable } from "@nestjs/common";
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { PrismaService } from "@/nest/infrastructure/prisma.service.js";
import { TokenInfrastructureService } from "@/nest/infrastructure/token.service.js";
import { AppError } from "@/nest/errors/app-error.js";

@Injectable()
export class SessionTokenService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenInfrastructureService)
    private readonly tokenInfrastructure: TokenInfrastructureService,
  ) {}

  async createSession(userId: string, refreshToken: string) {
    const hashedRefreshToken = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({
        where: { userId, expiresAt: { lt: new Date() } },
      });
      await tx.refreshToken.create({
        data: { token: hashedRefreshToken, userId, expiresAt },
      });

      const sessions = await tx.refreshToken.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

      if (sessions.length > 5) {
        await tx.refreshToken.deleteMany({
          where: { id: { in: sessions.slice(5).map((session) => session.id) } },
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

    const hashedIncomingToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    const user = await this.prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        refreshTokens: true,
        accounts: true,
        emailChangeRequests: true,
        profile: true,
        settings: true,
      },
    });
    const tokenExists = user?.refreshTokens.find(
      (session) => session.token === hashedIncomingToken,
    );

    if (!user || !tokenExists) {
      if (user) {
        await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      }
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
    const newHashedToken = crypto
      .createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");

    await this.prisma.$transaction([
      this.prisma.refreshToken.delete({ where: { token: hashedIncomingToken } }),
      this.prisma.refreshToken.create({
        data: {
          token: newHashedToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId: user.id, expiresAt: { lt: new Date() } },
      }),
    ]);

    return { user, newAccessToken, newRefreshToken };
  }
}
