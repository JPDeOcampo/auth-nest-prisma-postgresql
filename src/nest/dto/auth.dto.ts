import type { z } from "zod";
import {
  emailSchema,
  loginSchema,
  oauthLoginSchema,
  passwordSchema,
  registerSchema,
  resetPasswordSchema,
  updatePasswordSchema,
  updateProfileSchema,
  updateSettingsSchema,
  verifyResetPasswordSchema,
  deleteUserOauthSchema,
} from "@/nest/validation/user.schemas.js";

export type RegisterDto = z.infer<typeof registerSchema>;
export type EmailDto = z.infer<typeof emailSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type OAuthLoginDto = z.infer<typeof oauthLoginSchema>;
export type PasswordDto = z.infer<typeof passwordSchema>;
export type UpdatePasswordDto = z.infer<typeof updatePasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type VerifyResetPasswordDto = z.infer<typeof verifyResetPasswordSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;
export type DeleteUserOauthDto = z.infer<typeof deleteUserOauthSchema>;
