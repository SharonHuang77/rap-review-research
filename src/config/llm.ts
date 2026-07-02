/**
 * Centralised LLM configuration.
 *
 * All values are externalised via environment variables with sensible
 * defaults, so model identifiers, region, and inference parameters are never
 * hardcoded inside review architectures.
 */

/** Supported provider names. */
export type LLMProviderName = "bedrock" | "mock";

export interface LLMConfig {
  readonly provider: LLMProviderName;
  readonly region: string;
  readonly defaultModel: string;
  readonly temperature: number;
  readonly maxTokens: number;
}

/** Per-1K-token USD pricing used for cost estimation. */
export interface ModelPricing {
  readonly inputPer1kUsd: number;
  readonly outputPer1kUsd: number;
}

/**
 * Default Bedrock model id. Overridable via `LLM_DEFAULT_MODEL`.
 *
 * This is a cross-region **inference profile** id (verified working in
 * us-east-1). Newer Claude Sonnet models are only invokable via a profile, not
 * a bare on-demand model id. Switch to another approved Sonnet (e.g.
 * `us.anthropic.claude-sonnet-4-6` or `us.anthropic.claude-sonnet-5`) via
 * `LLM_DEFAULT_MODEL`.
 */
const DEFAULT_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Resolved LLM configuration for the current process. */
export const LLM_CONFIG: LLMConfig = {
  provider: process.env.LLM_PROVIDER === "mock" ? "mock" : "bedrock",
  region: process.env.LLM_REGION ?? process.env.AWS_REGION ?? "us-east-1",
  defaultModel: process.env.LLM_DEFAULT_MODEL ?? DEFAULT_MODEL_ID,
  temperature: numberFromEnv("LLM_TEMPERATURE", 0),
  maxTokens: numberFromEnv("LLM_MAX_TOKENS", 4096),
};

/**
 * Approximate pricing table (USD per 1K tokens). Values are estimates for
 * research cost-tracking, not billing — confirm current Bedrock pricing before
 * relying on cost metrics. Unknown models estimate `0`.
 *
 * Claude Sonnet 4.x list price is $3 / MTok input and $15 / MTok output for the
 * standard (≤200K) context tier. Cross-region inference profiles share the
 * underlying model's price, so `us.`/`global.` variants are keyed separately.
 */
export const LLM_PRICING: Record<string, ModelPricing> = {
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": {
    inputPer1kUsd: 0.003,
    outputPer1kUsd: 0.015,
  },
  "global.anthropic.claude-sonnet-4-5-20250929-v1:0": {
    inputPer1kUsd: 0.003,
    outputPer1kUsd: 0.015,
  },
  "anthropic.claude-3-5-sonnet-20240620-v1:0": {
    inputPer1kUsd: 0.003,
    outputPer1kUsd: 0.015,
  },
};

/**
 * Estimate the USD cost of an invocation. Returns `0` when no pricing entry
 * exists for the model.
 */
export function estimateCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  pricing: Record<string, ModelPricing> = LLM_PRICING,
): number {
  const entry = pricing[modelId];
  if (!entry) {
    return 0;
  }
  return (
    (inputTokens / 1000) * entry.inputPer1kUsd +
    (outputTokens / 1000) * entry.outputPer1kUsd
  );
}
