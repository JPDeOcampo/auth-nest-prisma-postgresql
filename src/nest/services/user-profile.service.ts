import { Inject, Injectable } from "@nestjs/common";
import { ProfileSettingsService } from "@/nest/services/profile-settings.service.js";
import type { UserUpdateDTO } from "@/nest/types/auth.types.js";

@Injectable()
export class NestUserProfileService {
  constructor(
    @Inject(ProfileSettingsService)
    private readonly profileSettingsService: ProfileSettingsService,
  ) {}

  updateProfile(
    userId: string,
    payload: Partial<UserUpdateDTO>,
  ) {
    return this.profileSettingsService.updateProfile(userId, payload);
  }

  updateSettings(userId: string, payload: { darkMode: boolean }) {
    return this.profileSettingsService.updateSettings(userId, payload);
  }
}
