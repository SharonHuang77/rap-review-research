/**
 * Live Bedrock smoke test (RFC-03.5).
 *
 * Run with: `npm run smoke:bedrock`
 *
 * Makes ONE tiny real Converse call through the BedrockProvider to confirm
 * local AWS setup works end-to-end. It uses the AWS SDK default credential
 * provider chain — it never reads or stores access keys, and it is NOT part of
 * `npm test` / `npm run check` (those mock Bedrock).
 *
 * Configure AWS locally first (AWS CLI or SSO) and enable Bedrock model access.
 * Override the model/region via env if needed:
 *   LLM_DEFAULT_MODEL=... LLM_REGION=... npm run smoke:bedrock
 */
import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import type { LLMReviewRequest } from "../src/llm/models/llm-review-request.ts";
import { LLM_CONFIG } from "../src/config/llm.ts";
import {
  ProviderAuthenticationError,
  ProviderRateLimitError,
  ProviderResponseError,
  ProviderTimeoutError,
} from "../src/llm/errors.ts";

// Tiny request to keep the call fast and cheap.
const request: LLMReviewRequest = {
  systemPrompt: "You are a connectivity smoke test. Answer in one short word.",
  userPrompt: "Reply with the single word: ok",
  modelId: LLM_CONFIG.defaultModel,
  temperature: LLM_CONFIG.temperature,
  maxTokens: 16,
};

console.log("Bedrock smoke test");
console.log(`  region : ${LLM_CONFIG.region}`);
console.log(`  model  : ${request.modelId}`);
console.log("  calling Converse once...\n");

try {
  // No injected client -> real BedrockRuntimeClient using the default
  // credential provider chain (AWS CLI / SSO / env / IAM role).
  const provider = new BedrockProvider();
  const response = await provider.review(request);

  const tokens =
    response.inputTokens === 0 && response.outputTokens === 0
      ? "not reported"
      : `${response.inputTokens} in / ${response.outputTokens} out`;

  console.log("SUCCESS ✓");
  console.log(`  model id   : ${response.modelId}`);
  console.log(`  latency    : ${response.latencyMs} ms`);
  console.log(`  tokens     : ${tokens}`);
  console.log(`  est. cost  : $${response.estimatedCostUsd.toFixed(6)}`);
  console.log(`  reply text : ${JSON.stringify(response.text.trim())}`);
} catch (error) {
  process.exitCode = 1;
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  console.error("FAILED ✗");
  console.error(`  error : ${name}: ${message}`);
  console.error(`  hint  : ${hintFor(error)}`);
}

function hintFor(error: unknown): string {
  if (error instanceof ProviderAuthenticationError) {
    return "Credentials missing/invalid or no Bedrock permission. Run `aws sso login` (or `aws configure`) and ensure the principal has bedrock:InvokeModel.";
  }
  if (error instanceof ProviderResponseError) {
    return "Often a model-id/region/model-access issue. Confirm Bedrock model access is enabled for this model in this region, and that the model id is valid for Converse.";
  }
  if (error instanceof ProviderRateLimitError) {
    return "Throttled by Bedrock. Wait a moment and retry.";
  }
  if (error instanceof ProviderTimeoutError) {
    return "Request timed out. Check network/VPN and retry.";
  }
  return "Verify AWS is configured locally (aws sts get-caller-identity) and Bedrock access is enabled.";
}
