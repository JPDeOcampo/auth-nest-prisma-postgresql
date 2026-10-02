import { isIP } from "node:net";

type Environment = Record<string, string | undefined>;

const requiredVariables = [
  "NODE_ENV",
  "ORIGIN",
  "BACKEND_URL",
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "PEPPER",
  "EMAIL_USER",
  "EMAIL_PASS",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
] as const;

const validateUrl = (
  name: string,
  value: string,
  production: boolean,
  protocols: string[],
) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  if (!protocols.includes(url.protocol)) {
    throw new Error(
      production
        ? `${name} must use HTTPS in production`
        : `${name} must use ${protocols.join(" or ")}`,
    );
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(`${name} must contain only an origin`);
  }
};

export const validateEnvironment = (env: Environment = process.env) => {
  const production = env.NODE_ENV === "production";
  if (
    env.NODE_ENV !== "development" &&
    env.NODE_ENV !== "test" &&
    env.NODE_ENV !== "production"
  ) {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  const required = production
    ? [...requiredVariables, "REDIS_URL", "REDIS_PREFIX", "TRUST_PROXY"]
    : requiredVariables;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const accessSecret = env.JWT_ACCESS_SECRET!;
  const refreshSecret = env.JWT_REFRESH_SECRET!;
  const pepper = env.PEPPER!;

  if (accessSecret === refreshSecret) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");
  }
  if (new Set([accessSecret, refreshSecret, pepper]).size !== 3) {
    throw new Error("JWT secrets and PEPPER must all be different");
  }

  if (production) {
    for (const [name, value] of [
      ["JWT_ACCESS_SECRET", accessSecret],
      ["JWT_REFRESH_SECRET", refreshSecret],
      ["PEPPER", pepper],
    ]) {
      if (value.length < 32) {
        throw new Error(`${name} must be at least 32 characters in production`);
      }
    }

    if (!env.EMAIL_FROM?.trim()) {
      throw new Error("EMAIL_FROM is required in production");
    }
  }

  const urlProtocols = production ? ["https:"] : ["http:", "https:"];
  validateUrl("ORIGIN", env.ORIGIN!, production, urlProtocols);
  validateUrl("BACKEND_URL", env.BACKEND_URL!, production, urlProtocols);

  if (env.REDIS_URL) {
    let redisUrl: URL;
    try {
      redisUrl = new URL(env.REDIS_URL);
    } catch {
      throw new Error("REDIS_URL must be a valid absolute URL");
    }

    if (env.REDIS_PREFIX) {
      if (!/^[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)*:$/.test(env.REDIS_PREFIX)) {
        throw new Error(
          "REDIS_PREFIX must contain namespace segments and end with a colon",
        );
      }
    }

    if (
      (production && redisUrl.protocol !== "rediss:") ||
      (!production && !["redis:", "rediss:"].includes(redisUrl.protocol))
    ) {
      throw new Error(
        production
          ? "REDIS_URL must use rediss: in production"
          : "REDIS_URL must use redis: or rediss:",
      );
    }
    if (!redisUrl.hostname) {
      throw new Error("REDIS_URL must include a host");
    }
  }

  if (env.TRUST_PROXY) {
    const trustedProxies = env.TRUST_PROXY.split(",")
      .map((proxy) => proxy.trim())
      .filter(Boolean);
    const invalidProxy = trustedProxies.some((proxy) => {
      const [address, prefix, ...extra] = proxy.split("/");
      const addressType = isIP(address);
      const maxPrefix = addressType === 4 ? 32 : addressType === 6 ? 128 : 0;
      return (
        extra.length > 0 ||
        addressType === 0 ||
        (prefix !== undefined &&
          (!/^\d+$/.test(prefix) ||
            Number(prefix) < 0 ||
            Number(prefix) > maxPrefix))
      );
    });
    if (trustedProxies.length === 0 || invalidProxy) {
      throw new Error(
        "TRUST_PROXY must list explicit trusted proxy addresses or CIDR ranges",
      );
    }
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(env.DATABASE_URL!);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }

  if (
    databaseUrl.protocol !== "postgres:" &&
    databaseUrl.protocol !== "postgresql:"
  ) {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }
  if (
    production &&
    !["require", "verify-ca", "verify-full"].includes(
      databaseUrl.searchParams.get("sslmode") ?? "",
    )
  ) {
    throw new Error(
      "DATABASE_URL must set sslmode=require, verify-ca, or verify-full in production",
    );
  }

  if (env.PORT !== undefined) {
    const port = Number(env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("PORT must be an integer between 1 and 65535");
    }
  }
};
