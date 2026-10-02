import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getAuthToken } from "@/nest/utils/request-context.js";
import type { AuthenticatedRequest } from "@/nest/types/request.types.js";
import { AppError, serializeAppError } from "@/nest/errors/app-error.js";

@Injectable()
export class BearerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    if (!getAuthToken(req)) {
      res.status(401).json({ message: "Not authorized, no token" });
      return false;
    }

    try {
      const decoded = jwt.verify(
        getAuthToken(req)!,
        process.env.JWT_ACCESS_SECRET!,
      );
      if (
        typeof decoded !== "object" ||
        typeof decoded.id !== "string" ||
        decoded.purpose !== "auth" ||
        typeof decoded.iat !== "number" ||
        typeof decoded.exp !== "number"
      ) {
        throw new AppError("Token invalid or expired. Please try again later.", 401);
      }

      (req as AuthenticatedRequest).user = { id: decoded.id };
      return true;
    } catch (error) {
      const authError =
        error instanceof AppError
          ? error
          : new AppError(
              "Token invalid or expired. Please try again later.",
              401,
            );

      res.status(authError.statusCode).json(serializeAppError(authError));
      return false;
    }
  }
}
