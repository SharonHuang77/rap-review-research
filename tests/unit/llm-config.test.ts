import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LLM_CONFIG,
  estimateCostUsd,
} from "../../src/config/llm.ts";

test("LLM_CONFIG exposes a well-formed configuration", () => {
  assert.ok(LLM_CONFIG.provider === "bedrock" || LLM_CONFIG.provider === "mock");
  assert.equal(typeof LLM_CONFIG.region, "string");
  assert.ok(LLM_CONFIG.region.length > 0);
  assert.ok(LLM_CONFIG.defaultModel.length > 0);
  assert.equal(typeof LLM_CONFIG.temperature, "number");
  assert.ok(LLM_CONFIG.maxTokens > 0);
});

test("estimateCostUsd uses per-1K-token pricing", () => {
  const pricing = {
    "m": { inputPer1kUsd: 0.003, outputPer1kUsd: 0.015 },
  };
  // 1000/1000*0.003 + 2000/1000*0.015 = 0.003 + 0.03
  assert.equal(estimateCostUsd("m", 1000, 2000, pricing), 0.033);
});

test("estimateCostUsd returns 0 for an unknown model", () => {
  assert.equal(estimateCostUsd("unknown-model", 1000, 1000, {}), 0);
});
