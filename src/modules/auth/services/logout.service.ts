import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@/infrastructure/prisma/prisma.service.js";
import { AppError } from "@/common/errors/app-error.js";
import { generateSecureToken } from "@/infrastructure/token/token.utils.js";

@Injectable()
export class LogoutService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async userSingleLogout(token: string) {
    if (!token) {
      return;
    }

    const { hashedToken } = generateSecureToken({ token });
    return this.prisma.refreshToken.deleteMany({
      where: { tokenHash: hashedToken },
    });
  }

  async logoutAllDevices(userId: string | undefined) {
    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    return this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }
}
