import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "@/nest/infrastructure/prisma.service.js";
import { RedisService } from "@/nest/infrastructure/redis.service.js";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    try {
      await Promise.all([
        this.prisma.$queryRaw`SELECT 1`,
        this.redis.pingIfConfigured(),
      ]);
      return { status: "ok" };
    } catch {
      this.logger.warn("Readiness probe failed");
      throw new ServiceUnavailableException("Service is not ready");
    }
  }
}
