import { serialize } from "cookie";
import { Response } from "express";
import { clearCookieConfig } from "@/nest/utils/cookie.config.js";

export const appendSetCookie = (res: Response, ...cookies: string[]) => {
  const existing = res.getHeader("Set-Cookie");
  const currentCookies = Array.isArray(existing)
    ? existing.map((cookie) => String(cookie))
    : existing
      ? [String(existing)]
      : [];

  res.setHeader("Set-Cookie", [...currentCookies, ...cookies]);
};

export const clearAuthCookies = (res: Response) => {
  appendSetCookie(
    res,
    serialize("resend_verification_expires_at", "", clearCookieConfig({})),
    serialize("refreshToken", "", clearCookieConfig({})),
    serialize("is_logged_in", "", clearCookieConfig({})),
    serialize("verificationToken", "", clearCookieConfig({})),
    serialize("resetToken", "", clearCookieConfig({})),
    serialize("expiresAt", "", clearCookieConfig({})),
  );
};
