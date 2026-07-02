/**
 * Public barrel for the shared LLM layer (RFC-03.5).
 *
 * Review architectures import from here — never from a provider SDK directly.
 */
export type {
  LLMUsage,
  LLMReviewRequest,
  LLMReviewResponse,
} from "./models/index.ts";

export {
  PromptLoader,
  ContextBuilder,
  PromptBuilder,
} from "./prompts/index.ts";
export type {
  PromptLoaderOptions,
  ContextInput,
  PromptRole,
  BuildPromptInput,
  PromptBuilderDependencies,
} from "./prompts/index.ts";

export type { ILLMProvider } from "./provider/index.ts";
export {
  MockProvider,
  BedrockProvider,
  buildConverseRequest,
} from "./provider/index.ts";
export type {
  MockProviderOptions,
  BedrockConverseClient,
  BedrockProviderDependencies,
} from "./provider/index.ts";

export {
  ProviderAuthenticationError,
  ProviderTimeoutError,
  ProviderRateLimitError,
  ProviderResponseError,
  PromptNotFoundError,
} from "./errors.ts";

export {
  LLM_CONFIG,
  LLM_PRICING,
  estimateCostUsd,
} from "../config/llm.ts";
export type {
  LLMConfig,
  LLMProviderName,
  ModelPricing,
} from "../config/llm.ts";
