export interface UpdatePasswordDTO {
  id: string | undefined;
  currentPassword: string;
  newPassword: string;
}

export interface VerifyResetPasswordDTO {
  signToken: string | undefined;
  userId: string | undefined;
  otp: string;
}

export interface RefreshResetPasswordDTO {
  challengeId: string;
  purpose: "password-reset";
  maskedEmail: string;
  iat?: number;
  exp?: number;
}

export interface ResetPasswordDTO {
  signToken: string | undefined;
  userId: string | undefined;
  newPassword: string;
}

export interface ResendResetPasswordDTO {
  ipAddress: string | undefined;
  userAgent: string | undefined;
  userId: string | undefined;
  signToken: string | undefined;
}
