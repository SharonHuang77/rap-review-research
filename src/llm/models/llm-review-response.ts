/**
 * A provider-independent LLM response, with the execution metrics every
 * provider must report.
 *
 * Provider-specific payloads (e.g. a Bedrock Converse response) are mapped into
 * this shape. `modelId` records the model that actually served the request —
 * useful when the requested id is an inference profile or alias.
 */
export interface LLMReviewResponse {
  readonly text: string;
  readonly modelId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly estimatedCostUsd: number;
}
