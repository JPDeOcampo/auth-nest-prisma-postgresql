import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@/nest/infrastructure/prisma.service.js";
import { AppError } from "@/nest/errors/app-error.js";
import { generateSecureToken } from "@/nest/infrastructure/token.utils.js";

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
