import { z } from "zod";
import { reviewFindingInputSchema } from "./review-finding-schema.ts";

/** Version of the review-result schema, recorded in ValidationMetadata. */
export const SCHEMA_VERSION = "review-result-v1";

/**
 * Zod schema for a review result as it appears in *raw* model output.
 * `riskLevel` is accepted but not required (it is not part of the canonical
 * ValidatedReviewResult); `findings` is required (use `[]` for none).
 */
export const reviewResultInputSchema = z.object({
  summary: z.string(),
  riskLevel: z.string().optional(),
  findings: z.array(reviewFindingInputSchema),
});

export type ReviewResultInput = z.infer<typeof reviewResultInputSchema>;
