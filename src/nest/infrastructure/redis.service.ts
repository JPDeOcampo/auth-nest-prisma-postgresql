import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { createClient } from "redis";

const incrementWithExpiry = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;
const registerResetChallenge = `
local previous = redis.call("GET", KEYS[2])
if previous then
  redis.call("DEL", ARGV[1] .. previous)
  redis.call("DEL", ARGV[2] .. previous)
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3])
redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[3])
return 1
`;
const clearResetChallengesForUser = `
local challengeHash = redis.call("GET", KEYS[1])
if challengeHash then
  redis.call("DEL", ARGV[1] .. challengeHash)
  redis.call("DEL", ARGV[2] .. challengeHash)
end
redis.call("DEL", KEYS[1])
return 1
`;
const consumeOneTimeToken = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1])
  return 1
end
return 0
`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client = process.env.REDIS_URL
    ? createClient({ url: process.env.REDIS_URL })
    : undefined;
  private readonly localAttempts = new Map<
    string,
    { count: number; expiresAt: number }
  >();
  private readonly localResetChallenges = new Map<
    string,
    { userId: string; expiresAt: number }
  >();
  private readonly localUserChallenges = new Map<
    string,
    { challengeHash: string; expiresAt: number }
  >();
  private readonly localOneTimeTokens = new Map<
    string,
    { tokenHash: string; expiresAt: number }
  >();

  constructor() {
    this.client?.on("error", (error) =>
      this.logger.error(`Redis connection error: ${error.message}`),
    );
  }

  get keyPrefix() {
    return process.env.REDIS_PREFIX || "auth-api:";
  }

  key(namespace: string, key: string) {
    return `${this.keyPrefix}${namespace}:${key}`;
  }

  async onModuleInit() {
    if (this.client && !this.client.isOpen) {
      await this.client.connect();
    }
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  async sendCommand(...args: string[]) {
    if (!this.client?.isOpen) {
      throw new Error("Redis is not connected");
    }
    return this.client.sendCommand(args);
  }

  async incrementAttempt(key: string, windowSeconds: number) {
    if (this.client?.isOpen) {
      const count = await this.client.eval(incrementWithExpiry, {
        keys: [key],
        arguments: [String(windowSeconds)],
      });
      return Number(count);
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("Redis is required for production password recovery");
    }

    const now = Date.now();
    const current = this.localAttempts.get(key);
    if (!current || current.expiresAt <= now) {
      this.localAttempts.set(key, {
        count: 1,
        expiresAt: now + windowSeconds * 1000,
      });
      return 1;
    }

    current.count += 1;
    return current.count;
  }

  async clearAttempt(key: string) {
    if (this.client?.isOpen) {
      await this.client.del(key);
      return;
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("Redis is required for production password recovery");
    }
    this.localAttempts.delete(key);
  }

  async registerResetChallenge(
    challengeId: string,
    userId: string,
    ttlSeconds: number,
  ) {
    const challengeHash = this.hash(challengeId);
    const challengeKey = this.resetChallengeKey(challengeHash);
    const userKey = this.resetUserKey(userId);
    if (this.client?.isOpen) {
      await this.client.eval(registerResetChallenge, {
        keys: [challengeKey, userKey],
        arguments: [
          userId,
          challengeHash,
          String(ttlSeconds),
          this.keyPrefix + "reset-challenge:",
          this.keyPrefix + "reset-grant:",
        ],
      });
      return;
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("Redis is required for production password recovery");
    }

    const previous = this.localUserChallenges.get(userKey);
    if (previous) {
      this.localResetChallenges.delete(previous.challengeHash);
      this.localOneTimeTokens.delete(previous.challengeHash);
    }
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.localResetChallenges.set(challengeHash, { userId, expiresAt });
    this.localUserChallenges.set(userKey, { challengeHash, expiresAt });
  }

  async resolveResetChallenge(challengeId: string) {
    const challengeHash = this.hash(challengeId);
    const challengeKey = this.resetChallengeKey(challengeHash);
    if (this.client?.isOpen) {
      return (await this.client.get(challengeKey)) ?? undefined;
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("Redis is required for production password recovery");
    }

    const challenge = this.localResetChallenges.get(challengeHash);
    if (!challenge || challenge.expiresAt <= Date.now()) {
      return undefined;
    }
    return challenge.userId;
  }

  async registerOneTimeToken(
    token: string,
    challengeId: string,
    ttlSeconds: number,
  ) {
    const challengeHash = this.hash(challengeId);
    const key = this.resetGrantKey(challengeHash);
    const tokenHash = this.hash(token);
    if (this.client?.isOpen) {
      const result = await this.client.sendCommand([
        "SET",
        key,
        tokenHash,
        "EX",
        String(ttlSeconds),
      ]);
      if (String(result) !== "OK") {
        throw new Error("Unable to register one-time reset token");
      }
      return;
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("Redis is required for production password recovery");
    }

    this.localOneTimeTokens.set(challengeHash, {
      tokenHash,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async consumeOneTimeToken(token: string, challengeId: string) {
    const challengeHash = this.hash(challengeId);
    const key = this.resetGrantKey(challengeHash);
    const tokenHash = this.hash(token);
    if (this.client?.isOpen) {
      const consumed = await this.client.eval(consumeOneTimeToken, {
        keys: [key],
        arguments: [tokenHash],
      });
      return Number(consumed) === 1;
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("Redis is required for production password recovery");
    }

    const storedToken = this.localOneTimeTokens.get(challengeHash);
    const isValid =
      storedToken !== undefined &&
      storedToken.expiresAt > Date.now() &&
      storedToken.tokenHash === tokenHash;
    if (
      isValid ||
      (storedToken !== undefined && storedToken.expiresAt <= Date.now())
    ) {
      this.localOneTimeTokens.delete(challengeHash);
    }
    return isValid;
  }

  async clearResetChallengesForUser(userId: string) {
    const userKey = this.resetUserKey(userId);
    if (this.client?.isOpen) {
      await this.client.eval(clearResetChallengesForUser, {
        keys: [userKey],
        arguments: [
          this.keyPrefix + "reset-challenge:",
          this.keyPrefix + "reset-grant:",
        ],
      });
      return;
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("Redis is required for production password recovery");
    }

    const activeChallenge = this.localUserChallenges.get(userKey);
    if (activeChallenge) {
      this.localResetChallenges.delete(activeChallenge.challengeHash);
      this.localOneTimeTokens.delete(activeChallenge.challengeHash);
      this.localUserChallenges.delete(userKey);
    }
  }

  async pingIfConfigured() {
    if (this.client) {
      if (!this.client.isOpen) {
        throw new Error("Redis is not connected");
      }
      await this.client.ping();
    }
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private resetChallengeKey(challengeHash: string) {
    return this.key("reset-challenge", challengeHash);
  }

  private resetGrantKey(challengeHash: string) {
    return this.key("reset-grant", challengeHash);
  }

  private resetUserKey(userId: string) {
    return this.key("reset-user", this.hash(userId));
  }
}
