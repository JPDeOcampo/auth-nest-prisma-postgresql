import "dotenv/config";
import "reflect-metadata";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "@/app.module.js";
import { AppExceptionFilter } from "@/nest/filters/app-exception.filter.js";
import { validateEnvironment } from "@/nest/config/environment.js";
import { RedisService } from "@/nest/infrastructure/redis.service.js";

const asRedisData = (value: unknown): boolean | number | string => {
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  return Buffer.isBuffer(value) ? value.toString() : "0";
};

const asRedisReply = (value: unknown): RedisReply =>
  Array.isArray(value) ? value.map(asRedisData) : asRedisData(value);

const createLimiter = (
  redis: RedisService,
  prefix: string,
  windowMs: number,
  limit: number,
  keyGenerator?: (req: Request) => string,
) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    store:
      process.env.NODE_ENV === "production"
        ? new RedisStore({
            prefix: `${redis.keyPrefix}${prefix}`,
            sendCommand: async (...args: string[]): Promise<RedisReply> => {
              const reply = await redis.sendCommand(...args);
              return asRedisReply(reply);
            },
          })
        : undefined,
    handler: (_req, res) =>
      res.status(429).json({ message: "Too many requests. Please try again later." }),
  });

export async function createApp() {
  validateEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  const trustedProxies = process.env.TRUST_PROXY
    ?.split(",")
    .map((proxy) => proxy.trim())
    .filter(Boolean);
  if (trustedProxies?.length) {
    app.set("trust proxy", trustedProxies);
  }

  app.use(
    cors({
      origin: process.env.ORIGIN,
      credentials: true,
    }),
  );

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cookieParser());
  app.use(json());
  app.use(urlencoded({ extended: true }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const usesAuthCookie = [
      "accessToken",
      "refreshToken",
      "verificationToken",
      "resetToken",
    ].some((name) => Boolean(req.cookies?.[name]));
    const isUnsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (
      isUnsafeMethod &&
      ((usesAuthCookie && req.headers.origin !== process.env.ORIGIN) ||
        (req.headers.origin !== undefined &&
          req.headers.origin !== process.env.ORIGIN))
    ) {
      return res
        .status(403)
        .json({ message: "Cross-origin cookie-authenticated request blocked" });
    }
    return next();
  });

  const redis = app.get(RedisService);
  app.use(
    "/api/v1",
    createLimiter(redis, "global:", 15 * 60 * 1000, 600),
  );
  app.use(
    "/api/v1/auth",
    createLimiter(redis, "auth:", 15 * 60 * 1000, 120),
  );
  app.use(
    "/api/v1/auth/login",
    createLimiter(redis, "login:", 60 * 1000, 10),
  );
  app.use(
    "/api/v1/auth/oauth-login",
    createLimiter(redis, "oauth-login:", 60 * 1000, 10),
  );
  app.use(
    "/api/v1/auth/signup",
    createLimiter(redis, "signup:", 15 * 60 * 1000, 10),
  );
  app.use(
    "/api/v1/auth/resend-verification-email",
    createLimiter(redis, "verification-resend:", 15 * 60 * 1000, 5),
  );
  app.use(
    "/api/v1/auth/refresh-token",
    createLimiter(redis, "refresh:", 60 * 1000, 30),
  );
  app.use(
    "/api/v1/auth/forgot-password",
    createLimiter(redis, "forgot-password:", 15 * 60 * 1000, 5),
  );
  app.use(
    "/api/v1/auth/forgot-password",
    createLimiter(
      redis,
      "forgot-email:",
      60 * 60 * 1000,
      3,
      (req) => {
        const email = req.body?.email;
        if (typeof email !== "string") {
          return ipKeyGenerator(req.ip || req.socket.remoteAddress || "");
        }
        return `email:${createHash("sha256")
          .update(email.trim().toLowerCase())
          .digest("hex")}`;
      },
    ),
  );
  app.use(
    "/api/v1/auth/reset/verify-reset-password",
    createLimiter(redis, "reset-otp:", 15 * 60 * 1000, 10),
  );
  app.use(
    "/api/v1/auth/reset/resend-reset-password",
    createLimiter(redis, "reset-resend:", 15 * 60 * 1000, 5),
  );
  app.use(
    "/api/v1/auth/reset/reset-password",
    createLimiter(redis, "reset-submit:", 15 * 60 * 1000, 5),
  );

  app.useGlobalFilters(new AppExceptionFilter());
  await app.init();

  return app;
}

export async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.PORT || 5000);
  await app.listen(port);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrap();
}
