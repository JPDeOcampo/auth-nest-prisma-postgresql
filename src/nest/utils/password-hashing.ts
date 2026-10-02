import bcrypt from "bcrypt";
import crypto from "crypto";

const saltRounds = 12;

const passwordWithPepper = (password: string): string => {
  const pepper = process.env.PEPPER;
  if (!pepper) {
    throw new Error("PEPPER must be configured before hashing passwords");
  }
  return crypto.createHmac("sha256", pepper).update(password).digest("hex");
};

export const hashPassword = async (password: string): Promise<string> =>
  bcrypt.hash(passwordWithPepper(password), saltRounds);

export const verifyPassword = async (
  password: string,
  hashedPassword: string,
): Promise<boolean> =>
  bcrypt.compare(passwordWithPepper(password), hashedPassword);
