import type { z } from "zod";
import {
  reviewResultInputSchema,
  type ReviewResultInput,
} from "./schemas/review-result-schema.ts";
import { SchemaValidationError } from "./validation-errors.ts";

/**
 * Validates a parsed object against the review-result schema (Zod).
 *
 * It rejects missing/invalid required fields and never invents data.
 */
export class SchemaValidator {
  public validate(parsed: unknown): ReviewResultInput {
    const result = reviewResultInputSchema.safeParse(parsed);
    if (!result.success) {
      throw new SchemaValidationError(formatIssues(result.error));
    }
    return result.data;
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
