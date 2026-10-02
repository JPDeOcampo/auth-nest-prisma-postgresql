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
process.env.DATABASE_URL = "postgresql://localhost:5432/auth";
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

vi.mock("@/nest/services/auth.service.js", () => ({
  NestAuthService: class {
    register = vi.fn();
    login = vi.fn();
    oauthLogin = vi.fn();
    updateEmail = vi.fn();
    removeNewEmail = vi.fn();
    resendVerificationEmail = vi.fn();
    verifyEmail = vi.fn();
    deleteAccount = vi.fn();
    logout = vi.fn();
    logoutAllDevices = vi.fn();
  },
}));

vi.mock("@/nest/services/password.service.js", () => ({
  NestPasswordService: class {
    updatePassword = vi.fn();
    forgotPassword = vi.fn();
    verifyResetPassword = vi.fn();
    resendResetPassword = vi.fn();
    refreshResetPassword = vi.fn();
    resetPassword = vi.fn();
  },
}));

vi.mock("@/nest/services/token.service.js", () => ({
  NestTokenService: class {
    generateAuthTokens = vi.fn();
    refreshToken = vi.fn();
  },
}));

vi.mock("@/nest/services/user-profile.service.js", () => ({
  NestUserProfileService: class {
    updateProfile = vi.fn();
    updateSettings = vi.fn();
  },
}));

import { createApp } from "@/main.js";
import { getAuthToken } from "@/nest/utils/request-context.js";
import { appendSetCookie } from "@/nest/utils/cookies.js";
import { NestAuthService } from "@/nest/services/auth.service.js";
import { NestPasswordService } from "@/nest/services/password.service.js";
import { NestUserProfileService } from "@/nest/services/user-profile.service.js";

describe("Nest auth compatibility layer", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("normalizes bearer auth extraction across header arrays and cookie fallbacks", () => {
    expect(
      getAuthToken({
        headers: { authorization: ["Bearer token-from-header-array"] },
        cookies: { accessToken: "token-from-cookie" },
      } as any),
    ).toBe("token-from-header-array");

    expect(
      getAuthToken({
        headers: {},
        cookies: { accessToken: "token-from-cookie" },
      } as any),
    ).toBe("token-from-cookie");
  });

  it("serves a liveness endpoint and security headers", async () => {
    const res = await request(app.getHttpServer()).get("/health/live");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("appends multiple cookies without dropping earlier values in the same response", () => {
    const res: any = {
      headers: {},
      getHeader: vi.fn((name) => (name === "Set-Cookie" ? ["first=1"] : undefined)),
      setHeader: vi.fn(),
    };

    appendSetCookie(res, "second=2", "third=3");

    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", [
      "first=1",
      "second=2",
      "third=3",
    ]);
  });

  it("POST /api/v1/auth/login matches the Express access-token contract", async () => {
    const authService = app.get(NestAuthService) as any;
    authService.login.mockResolvedValue({
      user: {
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
      },
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

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
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("limits repeated login requests from a single client IP", async () => {
    const server = app.getHttpServer();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(server)
        .post("/api/v1/auth/login")
        .send({ email: "jane@example.com", password: "Password1!" });
    }

    const limited = await request(server)
      .post("/api/v1/auth/login")
      .send({ email: "jane@example.com", password: "Password1!" });

    expect(limited.status).toBe(429);
    expect(limited.body.message).toContain("Too many requests");
  });

  it("limits password-reset requests per normalized email", async () => {
    const passwordService = app.get(NestPasswordService) as any;
    passwordService.forgotPassword.mockResolvedValue({
      newSignToken: "sign-token",
      signTokenExpiresAt: 300,
      expiresAt: 120,
      expiresIn: 120,
      userId: "challenge-id",
      email: "j***@example.com",
    });
    const server = app.getHttpServer();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(server)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "Jane@example.com" });
    }

    const limited = await request(server)
      .post("/api/v1/auth/forgot-password")
      .send({ email: " jane@example.com " });

    expect(limited.status).toBe(429);
  });

  it("does not accept a password-reset token as an access token", async () => {
    const resetToken = jwt.sign(
      { id: "user_1", purpose: "password-reset" },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: "2m" },
    );

    const res = await request(app.getHttpServer())
      .put("/api/v1/user/update-profile/user_1")
      .set("Authorization", `Bearer ${resetToken}`)
      .send({ firstName: "Jane", lastName: "Doe" });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Token invalid or expired/i);
  });


  it("PUT /api/v1/user/update-profile/:id honors bearer auth and normalizes the user payload", async () => {
    const validToken = jwt.sign({ id: "user_1", purpose: "auth" }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: "15m",
    });

    const profileService = app.get(NestUserProfileService) as any;
    profileService.updateProfile.mockResolvedValue({
      id: "user_1",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      loginCount: 2,
      emailStatus: "VERIFIED",
      profile: { profileType: "COLOR", profileValue: "#ff0000" },
      settings: { darkMode: false },
      accounts: [{ provider: "LOCAL", providerAccountId: "jane@example.com" }],
      emailChangeRequests: [],
    });

    const res = await request(app.getHttpServer())
      .put("/api/v1/user/update-profile/user_1")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ firstName: "Jane", lastName: "Smith" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Profile updated successfully!");
    expect(res.body.user.email).toBe("jane@example.com");
    expect(res.body.user.profile.profileType).toBe("COLOR");
    expect(profileService.updateProfile).toHaveBeenCalledWith("user_1", {
      firstName: "Jane",
      lastName: "Smith",
    });
  });

  it("POST /api/v1/auth/forgot-password preserves the reset-request contract and cookie set", async () => {
    const passwordService = app.get(NestPasswordService) as any;
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
      message: "If an account exists, a reset OTP has been sent. Please check your email.",
    });
    expect(res.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("verificationToken=sign-token")]),
    );
  });

  it("POST /api/v1/auth/reset/verify-reset-password/:id returns the reset-token contract and sets cookies", async () => {
    const passwordService = app.get(NestPasswordService) as any;
    passwordService.verifyResetPassword.mockResolvedValue("reset-token");

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/reset/verify-reset-password/user_1")
      .set("Cookie", "verificationToken=sign-token")
      .set("Origin", process.env.ORIGIN!)
      .send({ otp: "123456" });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("user_1");
    expect(res.body.message).toBe("Verification code is valid");
    expect(res.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("resetToken=reset-token")]),
    );
  });

  it("POST /api/v1/auth/update-email/:id preserves the verification cookie contract", async () => {
    const validToken = jwt.sign({ id: "user_1", purpose: "auth" }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: "15m",
    });

    const authService = app.get(NestAuthService) as any;
    authService.updateEmail.mockResolvedValue({
      emailChangeRequest: { id: "change_1", userId: "user_1", newEmail: "new@example.com" },
      expiresAt: "2026-09-21T14:00:00.000Z",
    });

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/update-email/user_1")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ email: "new@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email change requested. Please verify your new email address.");
    expect(res.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("resend_verification_expires_at="),
      ]),
    );
  });

  it("PUT /api/v1/auth/update-password/:id preserves the protected password-change contract", async () => {
    const validToken = jwt.sign({ id: "user_1", purpose: "auth" }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: "15m",
    });

    const passwordService = app.get(NestPasswordService) as any;
    passwordService.updatePassword.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .put("/api/v1/auth/update-password/user_1")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        currentPassword: "OldPassword1!",
        newPassword: "NewPassword1!",
        confirmPassword: "NewPassword1!",
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: "Password changed successfully" });
    expect(passwordService.updatePassword).toHaveBeenCalledWith({
      id: "user_1",
      currentPassword: "OldPassword1!",
      newPassword: "NewPassword1!",
    });
  });

  it("POST /api/v1/auth/delete-user/:id clears the session state and matches the Express contract", async () => {
    const validToken = jwt.sign({ id: "user_1", purpose: "auth" }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: "15m",
    });

    const authService = app.get(NestAuthService) as any;
    authService.deleteAccount.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/delete-user/user_1")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ password: "Password1!" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: "Account deleted successfully!" });
    expect(res.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("refreshToken="),
        expect.stringContaining("is_logged_in="),
      ]),
    );
  });

  it("POST /api/v1/auth/single-logout clears auth cookies and keeps the logout contract", async () => {
    const authService = app.get(NestAuthService) as any;
    authService.logout.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/single-logout")
      .set("Cookie", "refreshToken=old-refresh-token")
      .set("Origin", process.env.ORIGIN!);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: "Logged out successfully" });
    expect(authService.logout).toHaveBeenCalledWith("old-refresh-token");
  });

  it("rejects cross-origin state changes made with authentication cookies", async () => {
    const authService = app.get(NestAuthService) as any;

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/single-logout")
      .set("Cookie", "refreshToken=old-refresh-token")
      .set("Origin", "https://attacker.example");

    expect(res.status).toBe(403);
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it("rejects cross-origin login attempts before processing credentials", async () => {
    const authService = app.get(NestAuthService) as any;

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Origin", "https://attacker.example")
      .send({ email: "jane@example.com", password: "Password1!" });

    expect(res.status).toBe(403);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it("POST /api/v1/auth/login validates malformed bodies with the shared Zod error contract", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: "bad-email",
        password: "short",
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      message: "Validation failed",
    });
    expect(res.body.errors).toHaveProperty("email");
    expect(res.body.errors).toHaveProperty("password");
  });
});
