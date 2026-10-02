import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "@/nest/validation/zod-validation.pipe.js";
import {
  deleteUserOauthSchema,
  emailSchema,
  loginSchema,
  oauthLoginSchema,
  passwordSchema,
  registerSchema,
  resetPasswordSchema,
  updatePasswordSchema,
  verifyResetPasswordSchema,
} from "@/nest/validation/user.schemas.js";
import { BearerAuthGuard } from "@/nest/guards/bearer-auth.guard.js";
import { NestAuthService } from "@/nest/services/auth.service.js";
import { NestPasswordService } from "@/nest/services/password.service.js";
import { NestTokenService } from "@/nest/services/token.service.js";
import { clearAuthCookies } from "@/nest/utils/cookies.js";
import { getParamId } from "@/nest/utils/route-params.js";
import { getRequestContext } from "@/nest/utils/request-context.js";
import {
  clearResetTokenCookie,
  clearSessionCookies,
  setEmailVerificationCookie,
  setPasswordResetCookies,
  setRefreshTokenCookie,
  setResetTokenCookie,
  setSessionCookies,
  setVerificationExpiryCookie,
} from "@/nest/utils/auth-response.js";
import { serializeUserResponse } from "@/nest/utils/user-response.js";
import type {
  DeleteUserOauthDto,
  EmailDto,
  LoginDto,
  OAuthLoginDto,
  PasswordDto,
  RegisterDto,
  ResetPasswordDto,
  UpdatePasswordDto,
  VerifyResetPasswordDto,
} from "@/nest/dto/auth.dto.js";

@Controller("api/v1/auth")
export class AuthController {
  constructor(
    @Inject(NestAuthService) private readonly authService: NestAuthService,
    @Inject(NestPasswordService)
    private readonly passwordService: NestPasswordService,
    @Inject(NestTokenService) private readonly tokenService: NestTokenService,
  ) {}

  @Post("signup")
  async signup(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterDto,
  ) {
    const { ipAddress, userAgent } = getRequestContext(req);

    await this.authService.register({
      ...body,
      ipAddress,
      userAgent,
    });

    return res.status(201).json({
      message:
        "Registration was successful. Please check your inbox to verify your email address before logging in.",
    });
  }

  @Post("resend-verification-email/:id")
  async resendVerificationEmailRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodValidationPipe(emailSchema)) body: EmailDto,
  ) {
    const userId = getParamId(req.params.id);
    const { ipAddress, userAgent } = getRequestContext(req);
    const result = await this.authService.resendVerificationEmail(
      userId,
      body.email,
      ipAddress,
      userAgent,
    );

    setVerificationExpiryCookie(res, result || "");

    return res.status(200).json({
      message:
        "New verification email sent successfully! Please check your inbox.",
    });
  }

  @Get("verify-email")
  async verifyEmailRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Query("token") token: string,
  ) {
    const isVerified = await this.authService.verifyEmail(token);

    setEmailVerificationCookie(res, isVerified);

    return res.redirect(`${process.env.ORIGIN}/login`);
  }

  @Post("login")
  async loginRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
  ) {
    const { ipAddress, userAgent } = getRequestContext(req);
    const { user, accessToken, refreshToken } = await this.authService.login({
      ...body,
      ipAddress,
      userAgent,
    });
    setSessionCookies(res, refreshToken);

    return res.status(200).json({
      accessToken,
      user: serializeUserResponse(user),
    });
  }

  @Post("oauth-login")
  async oauthLoginRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodValidationPipe(oauthLoginSchema)) body: OAuthLoginDto,
  ) {
    const result = await this.authService.oauthLogin({
      ...body,
    });

    if (!result) {
      return res.status(401).json({ message: "Authentication failed" });
    }

    const { user, accessToken, refreshToken } = result;

    setSessionCookies(res, refreshToken);

    return res.status(200).json({
      accessToken,
      user: serializeUserResponse(user),
    });
  }

  @Post("refresh-token")
  async refreshTokenRoute(@Req() req: Request, @Res() res: Response) {
    const { user, newAccessToken, newRefreshToken } =
      await this.tokenService.refreshToken(req.cookies.refreshToken);

    setRefreshTokenCookie(res, newRefreshToken);

    return res.status(200).json({
      user: serializeUserResponse(user),
      accessToken: newAccessToken,
    });
  }

  @Post("update-email/:id")
  @UseGuards(BearerAuthGuard)
  async updateEmailRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(emailSchema)) body: EmailDto,
  ) {
    const userId = getParamId(id);
    const { ipAddress, userAgent } = getRequestContext(req);
    const result = await this.authService.updateEmail(userId, {
      email: body.email,
      ipAddress,
      userAgent,
    });

    setVerificationExpiryCookie(res, result.expiresAt || "");

    return res.status(200).json({
      message: "Email change requested. Please verify your new email address.",
      newEmail: result.emailChangeRequest,
    });
  }

  @Post("remove-new-email/:id")
  @UseGuards(BearerAuthGuard)
  async removeNewEmailRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(emailSchema)) body: EmailDto,
  ) {
    const userId = getParamId(id);
    await this.authService.removeNewEmail(userId, body.email);

    setVerificationExpiryCookie(res, "");

    return res
      .status(200)
      .json({ message: "Removed unverified email successfully!" });
  }

  @Put("update-password/:id")
  @UseGuards(BearerAuthGuard)
  async updatePasswordRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePasswordSchema)) body: UpdatePasswordDto,
  ) {
    const userId = getParamId(id);
    await this.passwordService.updatePassword({
      id: userId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });

    return res.status(200).json({ message: "Password changed successfully" });
  }

  @Post("forgot-password")
  async forgotPasswordRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodValidationPipe(emailSchema)) body: EmailDto,
  ) {
    const { ipAddress, userAgent } = getRequestContext(req);

    const {
      newSignToken,
      signTokenExpiresAt,
      expiresAt,
      expiresIn,
      userId,
      email,
    } = await this.passwordService.forgotPassword({
      email: body.email,
      ipAddress,
      userAgent,
    });

    setPasswordResetCookies(
      res,
      newSignToken,
      expiresAt,
      expiresIn,
      signTokenExpiresAt,
    );

    return res.status(200).json({
      userId,
      email,
      expiresIn,
      expiresAt,
      message:
        "If an account exists, a reset OTP has been sent. Please check your email.",
    });
  }

  @Post("reset/verify-reset-password/:id")
  async verifyResetPasswordRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(verifyResetPasswordSchema))
    body: VerifyResetPasswordDto,
  ) {
    const userId = getParamId(id);
    const resetToken = await this.passwordService.verifyResetPassword({
      signToken: req.cookies.verificationToken,
      userId,
      otp: body.otp,
    });

    setResetTokenCookie(res, resetToken);

    return res.status(200).json({
      userId: id,
      message: "Verification code is valid",
    });
  }

  @Post("reset/resend-reset-password/:id")
  async resendResetPasswordRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
  ) {
    const { ipAddress, userAgent } = getRequestContext(req);
    const signToken = req.cookies.verificationToken || req.cookies.resetToken;
    const userId = getParamId(id);

    const { expiresIn, newSignToken, signTokenExpiresAt, expiresAt } =
      await this.passwordService.resendResetPassword({
        ipAddress,
        userAgent,
        userId,
        signToken,
      });

    setPasswordResetCookies(
      res,
      newSignToken,
      expiresAt,
      expiresIn,
      signTokenExpiresAt,
    );

    return res.status(200).json({
      expiresIn,
      message: "Reset code is sent to your email",
    });
  }

  @Get("reset/refresh-reset-password")
  async refreshResetPasswordRoute(@Req() req: Request, @Res() res: Response) {
    const { userId, email, expiresIn } =
      await this.passwordService.refreshResetPassword({
        signToken: req.cookies.verificationToken || req.cookies.resetToken,
        expiresAt: req.cookies.expiresAt,
      });

    return res.status(200).json({
      userId,
      email,
      expiresIn,
      message: "Reset token is valid",
    });
  }

  @Post("reset/reset-password/:id")
  async resetPasswordRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordDto,
  ) {
    const userId = getParamId(id);
    await this.passwordService.resetPassword({
      signToken: req.cookies.resetToken,
      userId,
      newPassword: body.newPassword,
    });

    clearResetTokenCookie(res);

    return res.status(200).json({ message: "Password reset successfully" });
  }

  @Post("delete-user/:id")
  @UseGuards(BearerAuthGuard)
  async deleteUserRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(passwordSchema)) body: PasswordDto,
  ) {
    const userId = getParamId(id);
    await this.authService.deleteAccount({
      userId,
      password: body.password,
    });

    clearSessionCookies(res);

    return res.status(200).json({ message: "Account deleted successfully!" });
  }

  @Post("delete-user-oauth/:id")
  @UseGuards(BearerAuthGuard)
  async deleteUserOauthRoute(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(deleteUserOauthSchema))
    body: DeleteUserOauthDto,
  ) {
    const userId = getParamId(id);
    await this.authService.deleteAccount({
      userId,
      idToken: body.idToken,
    });

    clearSessionCookies(res);

    return res.status(200).json({ message: "Account deleted successfully!" });
  }

  @Post("single-logout")
  async logoutRoute(@Req() req: Request, @Res() res: Response) {
    await this.authService.logout(req.cookies.refreshToken);
    clearAuthCookies(res);

    return res.status(200).json({ message: "Logged out successfully" });
  }
}
