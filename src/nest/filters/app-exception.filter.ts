import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Response } from "express";
import { AppError, serializeAppError } from "@/nest/errors/app-error.js";

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof AppError) {
      return response.status(exception.statusCode).json(serializeAppError(exception));
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      return response.status(status).json(
        typeof payload === "string"
          ? { message: payload }
          : payload,
      );
    }

    if (exception instanceof Error) {
      return response.status(500).json({
        message: exception.message,
      });
    }

    return response.status(500).json({
      message: "Something went wrong",
    });
  }
}
