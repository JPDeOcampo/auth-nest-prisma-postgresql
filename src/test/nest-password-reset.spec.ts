import { describe, expect, it, vi } from "vitest";
import { PasswordResetService } from "@/nest/services/password-reset.service.js";

describe("Nest password reset provider", () => {
  it("returns an opaque challenge for unknown accounts without exposing an internal ID", async () => {
    const redis = { registerResetChallenge: vi.fn() };
    const service = new PasswordResetService(
      { user: { findUnique: vi.fn().mockResolvedValue(null) } } as never,
      {} as never,
      { sign: vi.fn().mockResolvedValue("signed-reset-token") } as never,
      redis as never,
    );

    const result = await service.forgotPassword({
      email: "jane@example.com",
    });

    expect(result.email).toBe("ja**@example.com");
    expect(result.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(redis.registerResetChallenge).toHaveBeenCalledWith(
      result.userId,
      expect.any(String),
      360,
    );
  });

  it("stores and emails a reset OTP for a local password account", async () => {
    const user = {
      id: "user_1",
      firstName: "Jane",
      email: "jane@example.com",
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      account: { findFirst: vi.fn().mockResolvedValue({ passwordHash: "hash" }) },
      authToken: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const mailer = { send: vi.fn().mockResolvedValue(true) };
    const tokens = {
      sign: vi.fn().mockResolvedValue("signed-reset-token"),
      generateSecureToken: vi.fn(({ token }: { token: string }) => ({
        token,
        hashedToken: "hashed-otp",
        expiresAt: new Date(),
      })),
    };
    const service = new PasswordResetService(
      prisma as never,
      mailer as never,
      tokens as never,
      {
        incrementAttempt: vi.fn().mockResolvedValue(1),
        clearAttempt: vi.fn(),
        registerResetChallenge: vi.fn(),
        registerOneTimeToken: vi.fn(),
      } as never,
    );

    const result = await service.forgotPassword({
      email: " JANE@example.com ",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
    });

    expect(result).toMatchObject({
      newSignToken: "signed-reset-token",
      email: "ja**@example.com",
      expiresIn: 120,
    });
    expect(result.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(result.userId).not.toBe(user.id);
    expect(prisma.authToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tokenHash: "hashed-otp",
        type: "PASSWORD_RESET",
        userId: "user_1",
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
      }),
    });
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@example.com",
        subject: "Password Reset Request",
      }),
    );
  });

  it("marks a valid reset OTP as used and issues a short-lived reset token", async () => {
    const prisma = {
      authToken: {
        findFirst: vi.fn().mockResolvedValue({
          id: "token_1",
          userId: "user_1",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const mailer = { send: vi.fn() };
    const tokens = {
      verifySignToken: vi.fn().mockReturnValue({
        challengeId: "challenge_1",
        purpose: "password-reset",
        maskedEmail: "ja**@example.com",
      }),
      generateSecureToken: vi.fn().mockReturnValue({
        hashedToken: "hashed-otp",
      }),
      sign: vi.fn().mockResolvedValue("short-reset-token"),
    };
    const service = new PasswordResetService(
      prisma as never,
      mailer as never,
      tokens as never,
      {
        incrementAttempt: vi.fn().mockResolvedValue(1),
        clearAttempt: vi.fn(),
        key: vi.fn((namespace: string, key: string) => `${namespace}:${key}`),
        resolveResetChallenge: vi.fn().mockResolvedValue("user_1"),
        registerResetChallenge: vi.fn(),
        registerOneTimeToken: vi.fn(),
      } as never,
    );

    await expect(
      service.verifyResetPassword({
        signToken: "verification-token",
        userId: "challenge_1",
        otp: "123456",
      }),
    ).resolves.toBe("short-reset-token");

    expect(prisma.authToken.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: "user_1",
        type: "PASSWORD_RESET",
        tokenHash: "hashed-otp",
        usedAt: null,
        revokedAt: null,
      }),
    });
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "token_1", usedAt: null }),
      data: { usedAt: expect.any(Date) },
    });
    expect(tokens.sign).toHaveBeenCalledWith({
      id: "challenge_1",
      type: "access",
      purpose: "password-reset",
      maskedEmail: "ja**@example.com",
      expiresIn: "2m",
    });
  });

  it("blocks further OTP verification after the per-user attempt limit", async () => {
    const prisma = {
      authToken: { findFirst: vi.fn() },
    };
    const tokens = {
      verifySignToken: vi.fn().mockReturnValue({
        challengeId: "challenge_1",
        purpose: "password-reset",
        maskedEmail: "ja**@example.com",
      }),
    };
    const redis = {
      incrementAttempt: vi.fn().mockResolvedValue(6),
      clearAttempt: vi.fn(),
      key: vi.fn((namespace: string, key: string) => `${namespace}:${key}`),
      resolveResetChallenge: vi.fn().mockResolvedValue("user_1"),
    };
    const service = new PasswordResetService(
      prisma as never,
      { send: vi.fn() } as never,
      tokens as never,
      redis as never,
    );

    await expect(
      service.verifyResetPassword({
        signToken: "verification-token",
        userId: "challenge_1",
        otp: "123456",
      }),
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(prisma.authToken.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a reset token whose subject does not match the requested user", async () => {
    const redis = { incrementAttempt: vi.fn(), clearAttempt: vi.fn() };
    const service = new PasswordResetService(
      {} as never,
      {} as never,
      {
        verifySignToken: vi.fn().mockReturnValue({
          challengeId: "another-challenge",
          purpose: "password-reset",
          maskedEmail: "ja**@example.com",
        }),
      } as never,
      redis as never,
    );

    await expect(
      service.verifyResetPassword({
        signToken: "verification-token",
        userId: "wrong-challenge",
        otp: "123456",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(redis.incrementAttempt).not.toHaveBeenCalled();
  });
});
