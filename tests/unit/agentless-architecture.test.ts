import { test } from "node:test";
import assert from "node:assert/strict";

import { AgentlessArchitecture } from "../../src/architectures/agentless/agentless-architecture.ts";
import type { IReviewArchitecture } from "../../src/architectures/review-architecture.ts";
import { PromptBuilder } from "../../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../../src/llm/prompts/context-builder.ts";
import { MockProvider } from "../../src/llm/provider/mock-provider.ts";
import { InMemoryRawDiffStorage } from "../../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { ProviderResponseError } from "../../src/llm/errors.ts";
import type { LLMReviewRequest } from "../../src/llm/models/llm-review-request.ts";
import type { MockProviderOptions } from "../../src/llm/provider/mock-provider.ts";
import type { ReviewExecutionInput } from "../../src/models/review-result.ts";
import { buildSnapshot } from "./support/fixtures.ts";
import { sampleDiff } from "./support/diffs.ts";

/** Wire Agentless with a real PromptBuilder + seeded raw-diff + a spying MockProvider. */
async function harness(mockOptions: MockProviderOptions = {}) {
  const calls: LLMReviewRequest[] = [];
  const provider = new MockProvider({
    ...mockOptions,
    onReview: (req) => {
      calls.push(req);
      mockOptions.onReview?.(req);
    },
  });

  const rawDiffStorage = new InMemoryRawDiffStorage();
  const snapshot = buildSnapshot();
  // Store the diff under the snapshot's key so Agentless can fetch it.
  await rawDiffStorage.saveRawDiff(snapshot.snapshotId, sampleDiff());

  const architecture = new AgentlessArchitecture({
    provider,
    promptBuilder: new PromptBuilder({
      loader: new PromptLoader(),
      contextBuilder: new ContextBuilder(),
    }),
    rawDiffStorage,
  });

  const input: ReviewExecutionInput = {
    experimentId: "exp_1",
    snapshot,
    modelVersion: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    promptVersion: "v1",
    workflowVersion: "workflow-v1",
  };

  return { architecture, input, calls };
}

test("AgentlessArchitecture implements IReviewArchitecture and is named agentless", async () => {
  const { architecture } = await harness();
  const asInterface: IReviewArchitecture = architecture;
  assert.equal(asInterface.name, "agentless");
});

test("makes exactly one provider call and returns a RawReviewResult with llmCalls = 1", async () => {
  const { architecture, input, calls } = await harness({
    response: {
      text: '{"summary":"looks fine","findings":[]}',
      inputTokens: 1200,
      outputTokens: 80,
      latencyMs: 900,
      estimatedCostUsd: 0.0042,
    },
  });

  const result = await architecture.execute(input);

  assert.equal(calls.length, 1); // exactly one LLM call
  assert.equal(result.architecture, "agentless");
  assert.equal(result.llmCalls, 1);
  assert.equal(result.inputTokens, 1200);
  assert.equal(result.outputTokens, 80);
  assert.equal(result.latencyMs, 900);
  assert.equal(result.estimatedCostUsd, 0.0042);
  // Best-effort surfacing (NOT validation) of the model output.
  assert.equal(result.summary, "looks fine");
  assert.deepEqual(result.findings, []);
  assert.equal(result.rawOutput, '{"summary":"looks fine","findings":[]}');
});

test("builds the request via the shared PromptBuilder (common + role + context)", async () => {
  const { architecture, input, calls } = await harness();
  await architecture.execute(input);

  const request = calls[0];
  assert.ok(request);
  assert.match(request.systemPrompt, /automated code reviewer/i); // common template
  assert.match(request.systemPrompt, /single, general-purpose reviewer/i); // agentless role
  assert.match(request.userPrompt, /# Pull Request/); // context block
  assert.match(request.userPrompt, /```diff/); // the diff is included
  // modelVersion from the experiment input is used as the model id.
  assert.equal(request.modelId, input.modelVersion);
});

test("llmCalls stays 1 regardless of the model output", async () => {
  const { architecture, input } = await harness({
    response: { text: "not even json" },
  });
  const result = await architecture.execute(input);
  assert.equal(result.llmCalls, 1);
  // Non-JSON output is surfaced as empty (no validation, no throw).
  assert.equal(result.summary, "");
  assert.deepEqual(result.findings, []);
  assert.equal(result.rawOutput, "not even json");
});

test("propagates provider errors without retrying", async () => {
  let attempts = 0;
  const { architecture, input } = await harness({
    failWith: new ProviderResponseError("bad response"),
    onReview: () => {
      attempts += 1;
    },
  });

  await assert.rejects(() => architecture.execute(input), ProviderResponseError);
  assert.equal(attempts, 1); // no internal retry
});
