import type { LLMReviewRequest } from "../models/llm-review-request.ts";
import type { LLMReviewResponse } from "../models/llm-review-response.ts";

/**
 * The provider-independent contract every LLM provider implements.
 *
 * Review architectures depend only on this interface — never on a
 * provider-specific SDK — so providers (Bedrock, mock, future) are
 * interchangeable.
 */
export interface ILLMProvider {
  review(request: LLMReviewRequest): Promise<LLMReviewResponse>;
}
