import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.ORIGIN = "http://localhost:3000";
process.env.BACKEND_URL = "http://localhost:5000";
process.env.PORT = "5000";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-different";
process.env.PEPPER = "test-pepper";
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/auth";
process.env.FIREBASE_PROJECT_ID = "test-project";
process.env.FIREBASE_CLIENT_EMAIL = "firebase@test.com";
process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n";
process.env.EMAIL_USER = "dev@test.com";
process.env.EMAIL_PASS = "secret";

vi.mock("firebase-admin", () => ({
  default: {
    apps: [],
    initializeApp: vi.fn(),
    credential: {
      cert: vi.fn(() => ({})),
    },
    auth: vi.fn(() => ({
      verifyIdToken: vi.fn(),
    })),
  },
}));

vi.mock("@/nest/infrastructure/prisma.service.js", () => ({
  PrismaService: class {
    user = {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    account = {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    authToken = {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    emailChangeRequest = {
      create: vi.fn(),
      delete: vi.fn(),
    };
    refreshToken = {
      deleteMany: vi.fn(),
    };
    $transaction = vi.fn();
    userSettings = {
      update: vi.fn(),
    };
  },
}));

vi.mock("@/nest/services/session-token.service.js", () => ({
  SessionTokenService: class {
    generateAuthTokens = vi.fn();
    createSession = vi.fn();
  },
}));

vi.mock("@/nest/infrastructure/firebase.service.js", () => ({
  FirebaseService: class {
    authClient = {
      verifyIdToken: vi.fn(),
    };
    auth() {
      return this.authClient;
    }
  },
}));

vi.mock("@/nest/utils/password-hashing.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/nest/utils/password-hashing.js")>();
  return {
    ...actual,
    verifyPassword: vi.fn(),
  };
});

vi.mock("@/nest/services/token.service.js", () => ({
  NestTokenService: class {
    refreshToken = vi.fn();
  },
}));

vi.mock("@/nest/services/logout.service.js", () => ({
  LogoutService: class {
    userSingleLogout = vi.fn();
  },
}));

vi.mock("@/nest/services/email-verification.service.js", () => ({
  EmailVerificationService: class {
    send = vi.fn();
    resend = vi.fn();
    verify = vi.fn();
  },
}));

vi.mock("@/nest/services/password-reset.service.js", () => ({
  PasswordResetService: class {
    updatePassword = vi.fn();
    forgotPassword = vi.fn();
    verifyResetPassword = vi.fn();
    resendResetPassword = vi.fn();
    refreshResetPassword = vi.fn();
    resetPassword = vi.fn();
  },
}));

import { createApp } from "@/main.js";
import { PrismaService } from "@/nest/infrastructure/prisma.service.js";
import { NestTokenService } from "@/nest/services/token.service.js";
import { LogoutService } from "@/nest/services/logout.service.js";
import { EmailVerificationService } from "@/nest/services/email-verification.service.js";
import { SessionTokenService } from "@/nest/services/session-token.service.js";
import { FirebaseService } from "@/nest/infrastructure/firebase.service.js";
import { NestAuthService } from "@/nest/services/auth.service.js";
import { PasswordResetService } from "@/nest/services/password-reset.service.js";
import { verifyPassword } from "@/nest/utils/password-hashing.js";

describe("Express API compatibility safety net", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("updates email through Nest providers and sends verification", async () => {
    const auth = app.get(NestAuthService);
    const prisma = app.get(PrismaService) as any;
    const verificationProvider = app.get(EmailVerificationService) as any;
    const currentUser = {
      id: "user_1",
      email: "old@example.com",
      firstName: "Jane",
      loginCount: 2,
    };
    const emailChangeRequest = {
      id: "change_1",
      userId: "user_1",
      newEmail: "new@example.com",
    };
    prisma.user.findUnique
      .mockResolvedValueOnce(currentUser)
      .mockResolvedValueOnce(null);
    prisma.emailChangeRequest.create.mockResolvedValue(emailChangeRequest);
    verificationProvider.send.mockResolvedValue(
      new Date("2026-10-02T00:00:00.000Z"),
    );

    const result = await auth.updateEmail("user_1", {
      email: " New@Example.com ",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
    });

    expect(result).toEqual({
      emailChangeRequest,
      expiresAt: "2026-10-02T00:00:00.000Z",
    });
    expect(verificationProvider.send).toHaveBeenCalledWith(
      {
        id: "user_1",
        email: "new@example.com",
        firstName: "Jane",
        loginCount: 2,
      },
      "127.0.0.1",
      "test-agent",
    );
  });

  it("returns a generic readiness response when a dependency is unavailable", async () => {
    const prisma = app.get(PrismaService) as any;
    prisma.$queryRaw = vi.fn().mockRejectedValue(
      new Error("sensitive database connection details"),
    );

    const res = await request(app.getHttpServer()).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body.message).toBe("Service is not ready");
    expect(JSON.stringify(res.body)).not.toContain("sensitive");
  });

  it("removes a pending email change and its verification token", async () => {
    const auth = app.get(NestAuthService);
    const prisma = app.get(PrismaService) as any;
    prisma.authToken.findFirst.mockResolvedValue({ id: "token_1" });
    prisma.emailChangeRequest.delete.mockResolvedValue({ id: "change_1" });

    const result = await auth.removeNewEmail("user_1", " NEW@example.com ");

    expect(result).toEqual({ id: "change_1" });
    expect(prisma.authToken.delete).toHaveBeenCalledWith({
      where: { id: "token_1" },
    });
    expect(prisma.emailChangeRequest.delete).toHaveBeenCalledWith({
      where: { userId: "user_1", newEmail: "new@example.com" },
    });
  });

  it("requires valid local credentials before deleting an account", async () => {
    const auth = app.get(NestAuthService);
    const prisma = app.get(PrismaService) as any;
    prisma.account.findFirst.mockResolvedValue({
      id: "account_1",
      passwordHash: "password-hash",
    });
    vi.mocked(verifyPassword).mockResolvedValue(false);

    await expect(
      auth.deleteAccount({ userId: "user_1", password: "wrong-password" }),
    ).rejects.toMatchObject({
      message: "Incorrect password.",
      statusCode: 401,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("POST /api/v1/auth/signup returns the existing registration response", async () => {
    const prisma = app.get(PrismaService) as any;
    const verificationProvider = app.get(EmailVerificationService) as any;
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "user_1",
      email: "jane@example.com",
      firstName: "Jane",
      loginCount: 0,
    });
    verificationProvider.send.mockResolvedValue(new Date());

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/signup")
      .send({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        password: "Password1!",
        confirmPassword: "Password1!",
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      message:
        "Registration was successful. Please check your inbox to verify your email address before logging in.",
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
        }),
      }),
    );
    expect(verificationProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user_1",
        email: "jane@example.com",
      }),
      expect.any(String),
      undefined,
    );
  });

  it("POST /api/v1/auth/signup preserves duplicate-email validation errors", async () => {
    const prisma = app.get(PrismaService) as any;
    prisma.user.findUnique.mockResolvedValue({ id: "existing_user" });

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/signup")
      .send({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        password: "Password1!",
        confirmPassword: "Password1!",
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      message: "The email is already registered.",
      field: "email",
    });
  });

  it("POST /api/v1/auth/login returns access token and user payload", async () => {
    const prisma = app.get(PrismaService) as any;
    const sessions = app.get(SessionTokenService) as any;
    const user: any = {
      id: "user_1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      loginCount: 1,
      emailStatus: "VERIFIED",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
      status: "ACTIVE",
      profile: null,
      settings: null,
      accounts: [],
      emailChangeRequests: [],
      loginAttempts: 0,
      lockoutUntil: null,
    };

    prisma.account.findFirst.mockResolvedValue({
      user,
      passwordHash: "password-hash",
    });
    vi.mocked(verifyPassword).mockResolvedValue(true);
    sessions.generateAuthTokens.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    sessions.createSession.mockResolvedValue(undefined);
    prisma.user.update.mockResolvedValue(user);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: "jane@example.com",
        password: "Password1!",
      });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("access-token");
    expect(res.body.user.email).toBe("jane@example.com");
    expect(res.headers["set-cookie"][0]).toContain("refreshToken=refresh-token");
    expect(sessions.createSession).toHaveBeenCalledWith(
      "user_1",
      "refresh-token",
    );
  });

  it("POST /api/v1/auth/login preserves invalid-credentials errors", async () => {
    const prisma = app.get(PrismaService) as any;
    prisma.account.findFirst.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: "jane@example.com",
        password: "WrongPassword123!",
      });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      message: "Invalid email or password.",
    });
  });

  it("POST /api/v1/auth/refresh-token rotates tokens and returns the user payload", async () => {
    const user: any = {
      id: "user_1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      loginCount: 1,
      emailStatus: "VERIFIED",
      refreshTokens: [],
      emailChangeRequests: [],
      profile: { profileType: "COLOR", profileValue: "#ff0000" },
      settings: { darkMode: true },
      accounts: [{ provider: "LOCAL", providerAccountId: "jane@example.com" }],
    };

    const nestTokenService = app.get(NestTokenService) as any;
    nestTokenService.refreshToken.mockResolvedValue({
      user,
      newAccessToken: "new-access-token",
      newRefreshToken: "new-refresh-token",
    } as any);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh-token")
      .set("Cookie", "refreshToken=old-refresh-token")
      .set("Origin", process.env.ORIGIN!);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("new-access-token");
    expect(res.body.user.email).toBe("jane@example.com");
    expect(res.headers["set-cookie"][0]).toContain("refreshToken=new-refresh-token");
  });

  it("returns 401 when a protected route is requested without any auth token", async () => {
    const res = await request(app.getHttpServer())
      .put("/api/v1/user/update-profile/user_1")
      .send({ firstName: "Jane", lastName: "Doe" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Not authorized, no token");
  });

  it("requires a valid bearer token for protected user routes", async () => {
    const res = await request(app.getHttpServer())
      .put("/api/v1/user/update-profile/user_1")
      .set("Authorization", "Bearer invalid-token")
      .send({ firstName: "Jane", lastName: "Doe" });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Token invalid or expired/i);
  });

  it("allows a valid bearer token to reach a protected user route", async () => {
    const validToken = jwt.sign({ id: "user_1", purpose: "auth" }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: "15m",
    });

    const prismaService = app.get(PrismaService) as any;
    prismaService.user.findUnique.mockResolvedValue({ id: "user_1" });
    prismaService.user.update.mockResolvedValue({
      id: "user_1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      loginCount: 1,
      emailStatus: "VERIFIED",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const res = await request(app.getHttpServer())
      .put("/api/v1/user/update-profile/user_1")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ firstName: "Jane", lastName: "Doe" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Profile updated successfully!");
    expect(prismaService.user.update).toHaveBeenCalled();
  });

  it("POST /api/v1/auth/signup validates malformed request bodies with the same contract", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/signup")
      .send({
        firstName: "J",
        lastName: "D",
        email: "not-an-email",
        password: "short",
        confirmPassword: "different",
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      message: "Validation failed",
    });
    expect(res.body.errors).toHaveProperty("firstName");
    expect(res.body.errors).toHaveProperty("email");
    expect(res.body.errors).toHaveProperty("password");
    expect(res.body.errors).toHaveProperty("confirmPassword");
  });

  it("PUT /api/v1/user/update-settings validates the darkMode contract", async () => {
    const validToken = jwt.sign({ id: "user_1", purpose: "auth" }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: "15m",
    });

    const res = await request(app.getHttpServer())
      .put("/api/v1/user/update-settings/user_1")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ darkMode: "yes" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      message: "Validation failed",
    });
    expect(res.body.errors).toHaveProperty("darkMode");
  });

  it("POST /api/v1/auth/oauth-login returns the same access-token response contract", async () => {
    const prisma = app.get(PrismaService) as any;
    const sessions = app.get(SessionTokenService) as any;
    const firebase = app.get(FirebaseService) as any;
    const user: any = {
      id: "user_1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      loginCount: 1,
      emailStatus: "VERIFIED",
      profile: null,
      settings: { darkMode: true },
      accounts: [],
      emailChangeRequests: [],
    };

    firebase.authClient.verifyIdToken.mockResolvedValue({
      uid: "firebase-user",
      email: "jane@example.com",
      name: "Jane Doe",
      picture: "https://example.com/avatar.png",
      email_verified: true,
    });
    prisma.user.findUnique.mockResolvedValue({ id: "user_1", status: "ACTIVE" });
    prisma.account.findFirst.mockResolvedValue(null);
    prisma.account.create.mockResolvedValue({});
    sessions.generateAuthTokens.mockResolvedValue({
      accessToken: "oauth-access-token",
      refreshToken: "oauth-refresh-token",
    });
    sessions.createSession.mockResolvedValue(undefined);
    prisma.user.update
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(user);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/oauth-login")
      .send({
        idToken: "google-id-token",
        provider: "GOOGLE",
      });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("oauth-access-token");
    expect(res.body.user.email).toBe("jane@example.com");
    expect(res.headers["set-cookie"][0]).toContain("refreshToken=oauth-refresh-token");
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        provider: "GOOGLE",
        providerAccountId: "firebase-user",
      },
    });
    expect(sessions.createSession).toHaveBeenCalledWith(
      "user_1",
      "oauth-refresh-token",
    );
  });

  it("POST /api/v1/auth/reset/verify-reset-password/:id preserves the verification-code contract", async () => {
    const passwordService = app.get(PasswordResetService) as any;
    passwordService.verifyResetPassword.mockResolvedValue("reset-token");

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/reset/verify-reset-password/user_1")
      .set("Cookie", "verificationToken=sign-token")
      .set("Origin", process.env.ORIGIN!)
      .send({ otp: "123456" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: "user_1",
      message: "Verification code is valid",
    });
    expect(passwordService.verifyResetPassword).toHaveBeenCalledWith({
      signToken: "sign-token",
      userId: "user_1",
      otp: "123456",
    });
    expect(res.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("resetToken=reset-token")]),
    );
  });

  it("POST /api/v1/auth/single-logout clears auth cookies", async () => {
    const logoutProvider = app.get(LogoutService) as any;
    logoutProvider.userSingleLogout.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/single-logout")
      .set("Cookie", "refreshToken=old-refresh-token")
      .set("Origin", process.env.ORIGIN!);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: "Logged out successfully" });
    expect(logoutProvider.userSingleLogout).toHaveBeenCalledWith("old-refresh-token");
  });

  it("GET /api/v1/auth/verify-email redirects after verification", async () => {
    const verificationProvider = app.get(EmailVerificationService) as any;
    verificationProvider.verify.mockResolvedValue(true);

    const res = await request(app.getHttpServer()).get(
      "/api/v1/auth/verify-email?token=test-token",
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/login");
  });

  it("POST /api/v1/auth/forgot-password preserves the reset request contract", async () => {
    const passwordService = app.get(PasswordResetService) as any;
    passwordService.forgotPassword.mockResolvedValue({
      newSignToken: "sign-token",
      signTokenExpiresAt: 300,
      expiresAt: 120,
      expiresIn: 120,
      userId: "user_1",
      email: "j***@example.com",
    });

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email: "jane@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: "user_1",
      email: "j***@example.com",
      message:
        "If an account exists, a reset OTP has been sent. Please check your email.",
    });
  });

  it("POST /api/v1/auth/reset/reset-password/:id uses cookies and preserves the reset contract", async () => {
    const passwordService = app.get(PasswordResetService) as any;
    passwordService.resetPassword.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/reset/reset-password/user_1")
      .set("Cookie", "resetToken=reset-token")
      .set("Origin", process.env.ORIGIN!)
      .send({
        newPassword: "NewPassword1!",
        confirmPassword: "NewPassword1!",
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: "Password reset successfully",
    });
    expect(passwordService.resetPassword).toHaveBeenCalledWith({
      signToken: "reset-token",
      userId: "user_1",
      newPassword: "NewPassword1!",
    });
  });
});
