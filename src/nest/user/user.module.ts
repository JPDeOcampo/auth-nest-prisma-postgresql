import { Module } from "@nestjs/common";
import { UserController } from "@/nest/user/user.controller.js";
import { NestUserProfileService } from "@/nest/services/user-profile.service.js";
import { ProfileSettingsService } from "@/nest/services/profile-settings.service.js";

@Module({
  controllers: [UserController],
  providers: [NestUserProfileService, ProfileSettingsService],
})
export class UserModule {}
