/**
 * Token accounting for a single LLM invocation.
 *
 * Mirrors the provider-reported usage (e.g. Bedrock `TokenUsage`) in a
 * provider-independent shape.
 */
export interface LLMUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}
