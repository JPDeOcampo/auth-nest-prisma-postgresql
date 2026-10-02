import { Injectable } from "@nestjs/common";
import {
  checkSignToken,
  generateSecureToken,
  generateSignToken,
} from "@/nest/infrastructure/token.utils.js";
import type { RefreshResetPasswordDTO } from "@/nest/types/password.types.js";

@Injectable()
export class TokenInfrastructureService {
  sign(payload: Parameters<typeof generateSignToken>[0]) {
    return generateSignToken(payload);
  }

  generateSecureToken(
    options?: Parameters<typeof generateSecureToken>[0],
  ) {
    return generateSecureToken(options);
  }

  verifySignToken(token: string): RefreshResetPasswordDTO {
    return checkSignToken(token);
  }
}
