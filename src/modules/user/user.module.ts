import { Module } from "@nestjs/common";
import { UserController } from "@/modules/user/user.controller.js";
import { NestUserProfileService } from "@/modules/user/services/user-profile.service.js";
import { ProfileSettingsService } from "@/modules/user/services/profile-settings.service.js";

@Module({
  controllers: [UserController],
  providers: [NestUserProfileService, ProfileSettingsService],
})
export class UserModule {}
