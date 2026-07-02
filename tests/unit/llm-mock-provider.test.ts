import { test } from "node:test";
import assert from "node:assert/strict";

import { MockProvider } from "../../src/llm/provider/mock-provider.ts";
import type { ILLMProvider } from "../../src/llm/provider/llm-provider.ts";
import type { LLMReviewRequest } from "../../src/llm/models/llm-review-request.ts";

const REQUEST: LLMReviewRequest = {
  systemPrompt: "system",
  userPrompt: "user",
  modelId: "model-x",
  temperature: 0,
  maxTokens: 256,
};

test("MockProvider is an ILLMProvider and returns deterministic defaults", async () => {
  const provider: ILLMProvider = new MockProvider();
  const response = await provider.review(REQUEST);

  assert.equal(response.modelId, "model-x"); // echoes the requested model
  assert.equal(typeof response.text, "string");
  assert.equal(response.inputTokens, 100);
  assert.equal(response.outputTokens, 50);
  assert.equal(response.latencyMs, 5);
  assert.equal(response.estimatedCostUsd, 0);
});

test("MockProvider honours configured overrides and the onReview hook", async () => {
  let seen: LLMReviewRequest | null = null;
  const provider = new MockProvider({
    response: { text: "custom", inputTokens: 7, estimatedCostUsd: 0.42 },
    onReview: (req) => {
      seen = req;
    },
  });

  const response = await provider.review(REQUEST);
  assert.equal(response.text, "custom");
  assert.equal(response.inputTokens, 7);
  assert.equal(response.estimatedCostUsd, 0.42);
  assert.equal(seen, REQUEST);
});

test("MockProvider can simulate provider failure", async () => {
  const provider = new MockProvider({ failWith: new Error("boom") });
  await assert.rejects(() => provider.review(REQUEST), /boom/);
});
