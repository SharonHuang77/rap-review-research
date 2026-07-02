import { test } from "node:test";
import assert from "node:assert/strict";

import { PromptLoader } from "../../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../../src/llm/prompts/context-builder.ts";
import { PromptBuilder } from "../../src/llm/prompts/prompt-builder.ts";
import { buildSnapshot } from "./support/fixtures.ts";
import { sampleDiff } from "./support/diffs.ts";

function builder(): PromptBuilder {
  return new PromptBuilder({
    loader: new PromptLoader(),
    contextBuilder: new ContextBuilder(),
  });
}

const BASE = {
  promptVersion: "v1",
  role: { category: "agentless", name: "system" },
  snapshot: buildSnapshot(),
  rawDiff: sampleDiff(),
  modelId: "test-model",
  temperature: 0,
  maxTokens: 4096,
} as const;

test("builds an LLMReviewRequest combining common + role into the system prompt", () => {
  const request = builder().build(BASE);

  assert.match(request.systemPrompt, /automated code reviewer/i); // common
  assert.match(request.systemPrompt, /single/i); // agentless role
  assert.equal(request.modelId, "test-model");
  assert.equal(request.temperature, 0);
  assert.equal(request.maxTokens, 4096);
});

test("user prompt carries the PR context", () => {
  const request = builder().build(BASE);
  assert.match(request.userPrompt, /# Pull Request/);
  assert.match(request.userPrompt, /Title: Add feature/);
});

test("renders the expected JSON schema only when provided", () => {
  const withSchema = builder().build({
    ...BASE,
    jsonSchema: { type: "object", properties: { summary: { type: "string" } } },
  });
  assert.match(withSchema.userPrompt, /## Expected JSON schema/);
  assert.match(withSchema.userPrompt, /"type": "object"/);
  assert.deepEqual(withSchema.jsonSchema, {
    type: "object",
    properties: { summary: { type: "string" } },
  });

  const withoutSchema = builder().build(BASE);
  assert.doesNotMatch(withoutSchema.userPrompt, /Expected JSON schema/);
  assert.equal(withoutSchema.jsonSchema, undefined);
});
