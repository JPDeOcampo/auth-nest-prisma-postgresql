import { serialize } from "cookie";
import type { Response } from "express";
import {
  clearCookieConfig,
  getCookieConfig,
} from "@/nest/utils/cookie.config.js";
import { appendSetCookie } from "@/nest/utils/cookies.js";

export const setSessionCookies = (res: Response, refreshToken: string) => {
  appendSetCookie(
    res,
    serialize("refreshToken", refreshToken, getCookieConfig({})),
    serialize("is_logged_in", "true", getCookieConfig({ httpOnly: false })),
  );
};

export const setRefreshTokenCookie = (res: Response, refreshToken: string) => {
  appendSetCookie(
    res,
    serialize("refreshToken", refreshToken, getCookieConfig({})),
  );
};

export const setVerificationExpiryCookie = (
  res: Response,
  value: string,
  maxAgeSeconds = 15 * 60,
) => {
  appendSetCookie(
    res,
    serialize(
      "resend_verification_expires_at",
      value,
      getCookieConfig({ httpOnly: false, maxAge: maxAgeSeconds }),
    ),
  );
};

export const setEmailVerificationCookie = (res: Response, isVerified: boolean) => {
  appendSetCookie(
    res,
    serialize(
      "is_verified",
      isVerified.toString(),
      getCookieConfig({ httpOnly: false, maxAge: 4 }),
    ),
    serialize("is_logged_in", "", clearCookieConfig({})),
    serialize("refreshToken", "", clearCookieConfig({})),
    serialize("resend_verification_expires_at", "", clearCookieConfig({})),
  );
};

export const clearSessionCookies = (res: Response) => {
  appendSetCookie(
    res,
    serialize("refreshToken", "", clearCookieConfig({})),
    serialize("is_logged_in", "", clearCookieConfig({})),
  );
};

export const setUserSettingsCookie = (res: Response, darkMode: boolean) => {
  appendSetCookie(
    res,
    serialize(
      "is_dark_mode",
      `${darkMode}`,
      getCookieConfig({ httpOnly: false }),
    ),
  );
};

export const setPasswordResetCookies = (
  res: Response,
  verificationToken: string,
  expiresAt: number,
  expiresIn: number,
  signTokenExpiresAt: number,
) => {
  appendSetCookie(
    res,
    serialize(
      "verificationToken",
      verificationToken,
      getCookieConfig({ maxAge: signTokenExpiresAt }),
    ),
    serialize("expiresAt", expiresAt.toString(), getCookieConfig({ maxAge: expiresIn })),
  );
};

export const setResetTokenCookie = (res: Response, resetToken: string) => {
  appendSetCookie(
    res,
    serialize("verificationToken", "", clearCookieConfig({})),
    serialize("resetToken", resetToken, getCookieConfig({ maxAge: 5 * 60 })),
  );
};

export const clearResetTokenCookie = (res: Response) => {
  appendSetCookie(
    res,
    serialize("verificationToken", "", clearCookieConfig({})),
    serialize("resetToken", "", clearCookieConfig({})),
    serialize("expiresAt", "", clearCookieConfig({})),
  );
};
