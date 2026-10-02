import { describe, expect, it } from "vitest";
import { validateEnvironment } from "@/nest/config/environment.js";

const validEnvironmentBase = {
  NODE_ENV: "production",
  ORIGIN: "https://app.example.com",
  BACKEND_URL: "https://api.example.com",
  DATABASE_URL: "postgresql://user:password@localhost:5432/auth",
  REDIS_URL: "rediss://redis.example.com:6380",
  REDIS_PREFIX: "auth-api:test:",
  TRUST_PROXY: "10.0.0.0/8,192.168.0.0/16",
  JWT_ACCESS_SECRET: "access-secret-that-is-at-least-32-characters-long",
  JWT_REFRESH_SECRET: "refresh-secret-that-is-at-least-32-characters-long",
  PEPPER: "password-pepper-that-is-at-least-32-characters-long",
  EMAIL_USER: "smtp-user",
  EMAIL_PASS: "smtp-password",
  EMAIL_FROM: "Auth Service <no-reply@example.com>",
  FIREBASE_PROJECT_ID: "firebase-project",
  FIREBASE_CLIENT_EMAIL: "service@example.com",
  FIREBASE_PRIVATE_KEY: "private-key",
  PORT: "5000",
};

const validDatabaseUrl = new URL(validEnvironmentBase.DATABASE_URL);
validDatabaseUrl.searchParams.set("sslmode", "require");
const validEnvironment = {
  ...validEnvironmentBase,
  DATABASE_URL: validDatabaseUrl.toString(),
};

describe("environment validation", () => {
  it("accepts complete production configuration", () => {
    expect(() => validateEnvironment(validEnvironment)).not.toThrow();
  });

  it("rejects missing required configuration", () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, DATABASE_URL: "" }),
    ).toThrow("DATABASE_URL");
  });

  it("rejects weak or duplicate production secrets", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_ACCESS_SECRET: "short",
      }),
    ).toThrow("JWT_ACCESS_SECRET must be at least 32 characters");

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_REFRESH_SECRET: validEnvironment.JWT_ACCESS_SECRET,
      }),
    ).toThrow("must be different");
  });

  it("requires HTTPS origins and a valid listen port in production", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        ORIGIN: "http://app.example.com",
      }),
    ).toThrow("ORIGIN must use HTTPS");

    expect(() =>
      validateEnvironment({ ...validEnvironment, PORT: "70000" }),
    ).toThrow("PORT must be an integer");
  });

  it("requires encrypted Redis and explicit proxy trust in production", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        REDIS_URL: "redis://redis.example.com:6379",
      }),
    ).toThrow("REDIS_URL must use rediss:");

    expect(() =>
      validateEnvironment({ ...validEnvironment, TRUST_PROXY: "*" }),
    ).toThrow("explicit trusted proxy addresses");
  });

  it("requires TLS for the production PostgreSQL connection", () => {
    const databaseUrl = new URL(validEnvironment.DATABASE_URL);
    databaseUrl.searchParams.delete("sslmode");

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: databaseUrl.toString(),
      }),
    ).toThrow("DATABASE_URL must set sslmode");
  });
});
