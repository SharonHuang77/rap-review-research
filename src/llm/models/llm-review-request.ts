/**
 * A provider-independent request to review a pull request with an LLM.
 *
 * Built by the {@link PromptBuilder} and consumed by any {@link ILLMProvider}.
 * It contains no provider-specific fields, so the same request can be sent to
 * Bedrock, a mock, or a future provider unchanged.
 */
export interface LLMReviewRequest {
  /** System prompt: common review instructions + role instructions. */
  readonly systemPrompt: string;
  /** User prompt: PR context (and, optionally, the expected JSON schema). */
  readonly userPrompt: string;
  /** Model identifier (resolved from configuration, never hardcoded in callers). */
  readonly modelId: string;
  /** Sampling temperature. */
  readonly temperature: number;
  /** Maximum number of tokens to generate. */
  readonly maxTokens: number;
  /** Optional expected output schema (advisory; rendered into the prompt). */
  readonly jsonSchema?: object;
}
