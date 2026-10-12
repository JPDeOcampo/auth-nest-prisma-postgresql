import type { Request } from "express";

export const getClientIp = (req: Request): string | undefined => {
  return req.ip || req.socket.remoteAddress;
};

export const getUserAgent = (req: Request): string | undefined =>
  typeof req.headers["user-agent"] === "string"
    ? req.headers["user-agent"]
    : undefined;

export const getRequestContext = (req: Request) => ({
  ipAddress: getClientIp(req),
  userAgent: getUserAgent(req),
});

export const getAuthToken = (req: Request): string | undefined => {
  const authHeader = req.headers.authorization;

  if (Array.isArray(authHeader)) {
    const bearerValue = authHeader.find(
      (value): value is string => typeof value === "string" && value.startsWith("Bearer "),
    );

    if (bearerValue) {
      return bearerValue.split(" ")[1];
    }
  }

  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  return typeof req.cookies?.accessToken === "string"
    ? req.cookies.accessToken
    : undefined;
};
