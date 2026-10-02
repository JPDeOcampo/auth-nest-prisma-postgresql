import { beforeEach, describe, expect, it } from "vitest";
import { RedisService } from "@/nest/infrastructure/redis.service.js";

describe("RedisService reset challenge behavior", () => {
  let redis: RedisService;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    delete process.env.REDIS_URL;
    redis = new RedisService();
  });

  it("invalidates an older challenge when a new challenge is issued", async () => {
    await redis.registerResetChallenge("challenge-one", "user-1", 60);
    await redis.registerResetChallenge("challenge-two", "user-1", 60);

    await expect(redis.resolveResetChallenge("challenge-one")).resolves.toBeUndefined();
    await expect(redis.resolveResetChallenge("challenge-two")).resolves.toBe("user-1");

    await redis.clearResetChallengesForUser("user-1");
    await expect(redis.resolveResetChallenge("challenge-two")).resolves.toBeUndefined();
  });

  it("consumes reset grants once and preserves grants for a mismatched token", async () => {
    await redis.registerResetChallenge("challenge-one", "user-1", 60);
    await redis.registerOneTimeToken("signed-reset-token", "challenge-one", 60);

    await expect(
      redis.consumeOneTimeToken("other-token", "challenge-one"),
    ).resolves.toBe(false);
    await expect(
      redis.consumeOneTimeToken("signed-reset-token", "challenge-one"),
    ).resolves.toBe(true);
    await expect(
      redis.consumeOneTimeToken("signed-reset-token", "challenge-one"),
    ).resolves.toBe(false);
  });
});
