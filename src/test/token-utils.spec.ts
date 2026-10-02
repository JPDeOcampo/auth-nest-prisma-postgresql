import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSecureToken } from "@/nest/infrastructure/token.utils.js";

describe("secure token hashing", () => {
  it("uses the password pepper for low-entropy reset codes", () => {
    const originalPepper = process.env.PEPPER;
    process.env.PEPPER = "test-only-reset-code-pepper";

    try {
      const result = generateSecureToken({
        token: "123456",
        usePepper: true,
      });

      expect(result.hashedToken).toBe(
        createHmac("sha256", process.env.PEPPER)
          .update("123456")
          .digest("hex"),
      );
    } finally {
      if (originalPepper === undefined) {
        delete process.env.PEPPER;
      } else {
        process.env.PEPPER = originalPepper;
      }
    }
  });
});
