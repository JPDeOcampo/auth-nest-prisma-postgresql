import {
  HttpException,
  Injectable,
  PipeTransform,
  type ArgumentMetadata,
} from "@nestjs/common";
import { z } from "zod";
import { formatZodValidationErrors } from "@/nest/validation/zod-error-format.js";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: z.ZodTypeAny) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== "body") {
      return value;
    }

    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new HttpException(
        {
          message: "Validation failed",
          errors: formatZodValidationErrors(result.error),
        },
        400,
      );
    }

    return result.data;
  }
}
