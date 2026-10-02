import crypto from "crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { AppError } from "@/nest/errors/app-error.js";
import type { RefreshResetPasswordDTO } from "@/nest/types/password.types.js";

export const checkSignToken = (token?: string) => {
  if (!token) {
    throw new AppError("Invalid or expired session.", 400);
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET!,
    );
    if (
      typeof decoded !== "object" ||
      typeof decoded.id !== "string" ||
      decoded.purpose !== "password-reset" ||
      typeof decoded.maskedEmail !== "string"
    ) {
      throw new Error("Invalid reset token claims");
    }

    return {
      challengeId: decoded.id,
      purpose: "password-reset",
      maskedEmail: decoded.maskedEmail,
      ...(typeof decoded.iat === "number" ? { iat: decoded.iat } : {}),
      ...(typeof decoded.exp === "number" ? { exp: decoded.exp } : {}),
    } satisfies RefreshResetPasswordDTO;
  } catch {
    throw new AppError("Session expired.", 400);
  }
};

export const generateSignToken = async ({
  id,
  type = "access",
  purpose = "auth",
  maskedEmail,
  expiresIn = "15m",
}: {
  id: string;
  type: "access" | "refresh";
  purpose?: string;
  maskedEmail?: string;
  expiresIn?: SignOptions["expiresIn"];
}) => {
  const secrets = {
    access: process.env.JWT_ACCESS_SECRET,
    refresh: process.env.JWT_REFRESH_SECRET,
  };
  const secret = secrets[type];

  if (!secret) {
    throw new Error(`JWT secret for ${type} token is not defined`);
  }

  return jwt.sign(
    { id, purpose, ...(maskedEmail ? { maskedEmail } : {}) },
    secret,
    { expiresIn },
  );
};

interface SecureTokenOptions {
  expiryMinutes?: number;
  byteLength?: number;
  token?: string;
  usePepper?: boolean;
}

interface SecureTokenResult {
  token: string;
  hashedToken: string;
  expiresAt: Date;
}

export const generateSecureToken = ({
  expiryMinutes = 15,
  byteLength = 32,
  token: customToken,
  usePepper = false,
}: SecureTokenOptions = {}): SecureTokenResult => {
  const token = customToken || crypto.randomBytes(byteLength).toString("hex");
  let hashedToken: string;
  if (usePepper) {
    const pepper = process.env.PEPPER;
    if (!pepper) {
      throw new Error("PEPPER must be configured before hashing reset codes");
    }
    hashedToken = crypto.createHmac("sha256", pepper).update(token).digest("hex");
  } else {
    hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  }
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  return { token, hashedToken, expiresAt };
};
