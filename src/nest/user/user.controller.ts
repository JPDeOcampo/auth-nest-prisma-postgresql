import { Body, Controller, Inject, Param, Put, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "@/nest/validation/zod-validation.pipe.js";
import { updateProfileSchema, updateSettingsSchema } from "@/nest/validation/user.schemas.js";
import { BearerAuthGuard } from "@/nest/guards/bearer-auth.guard.js";
import { NestUserProfileService } from "@/nest/services/user-profile.service.js";
import { getParamId } from "@/nest/utils/route-params.js";
import type { UpdateProfileDto, UpdateSettingsDto } from "@/nest/dto/auth.dto.js";
import { setUserSettingsCookie } from "@/nest/utils/auth-response.js";
import { serializeUserResponse } from "@/nest/utils/user-response.js";

@Controller("api/v1/user")
export class UserController {
  constructor(
    @Inject(NestUserProfileService)
    private readonly userProfileService: NestUserProfileService,
  ) {}

  @Put("update-profile/:id")
  @UseGuards(BearerAuthGuard)
  async updateProfileRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileDto,
  ) {
    const userId = getParamId(id);
    const user = await this.userProfileService.updateProfile(userId, {
      firstName: body.firstName,
      lastName: body.lastName,
    });

    return res.status(200).json({
      message: "Profile updated successfully!",
      user: serializeUserResponse(user),
    });
  }

  @Put("update-settings/:id")
  @UseGuards(BearerAuthGuard)
  async updateSettingsRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsDto,
  ) {
    const userId = getParamId(id);
    const settings = await this.userProfileService.updateSettings(userId, {
      darkMode: body.darkMode,
    });

    setUserSettingsCookie(res, settings.darkMode);

    return res.status(200).json({
      message: "Settings updated successfully!",
      settings,
    });
  }
}
