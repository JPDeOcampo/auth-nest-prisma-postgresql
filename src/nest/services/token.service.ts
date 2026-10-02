import { Inject, Injectable } from "@nestjs/common";
import { SessionTokenService } from "@/nest/services/session-token.service.js";

@Injectable()
export class NestTokenService {
  constructor(
    @Inject(SessionTokenService)
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  generateAuthTokens(userId: string) {
    return this.sessionTokenService.generateAuthTokens(userId);
  }

  refreshToken(token: string) {
    return this.sessionTokenService.refreshToken(token);
  }
}
