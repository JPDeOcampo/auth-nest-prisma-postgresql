import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@/nest/infrastructure/prisma.service.js";
import { AppError } from "@/nest/errors/app-error.js";
import { USER_SELECT } from "@/nest/constants/prisma-selects.constant.js";
import type { UserUpdateDTO } from "@/nest/types/auth.types.js";

@Injectable()
export class ProfileSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async updateProfile(
    userId: string,
    payload: Partial<UserUpdateDTO>,
  ) {
    const { firstName, lastName } = payload;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    if (!firstName && !lastName) {
      throw new AppError(
        "At least one field (firstName or lastName) is required.",
        400,
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { firstName, lastName },
      select: USER_SELECT,
    });
  }

  async updateSettings(userId: string, payload: { darkMode: boolean }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    return this.prisma.userSettings.update({
      where: { userId },
      data: { darkMode: payload.darkMode },
      select: { darkMode: true },
    });
  }
}
