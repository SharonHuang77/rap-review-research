import { test } from "node:test";
import assert from "node:assert/strict";

import { AgentlessArchitecture } from "../../src/architectures/agentless/agentless-architecture.ts";
import { PromptBuilder } from "../../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../../src/llm/prompts/context-builder.ts";
import { MockProvider } from "../../src/llm/provider/mock-provider.ts";
import { InMemoryRawDiffStorage } from "../../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { ValidationEngine } from "../../src/validation/validation-engine.ts";
import type { ReviewExecutionInput } from "../../src/models/review-result.ts";
import { buildSnapshot } from "./support/fixtures.ts";
import { sampleDiff } from "./support/diffs.ts";

// A realistic fenced + mixed-case response, like the one live Bedrock returned.
const FENCED_MODEL_OUTPUT = [
  "```json",
  JSON.stringify({
    summary: "Adds a null guard and a stub component; low risk.",
    riskLevel: "low",
    findings: [
      {
        title: "Non-functional component",
        severity: "MEDIUM",
        category: "Maintainability",
        file: "src/components/UserList.tsx",
        line: 2,
        description: "The component returns null.",
        recommendation: "Implement it or remove it.",
        confidence: 0.7,
      },
    ],
  }),
  "```",
].join("\n");

test("Agentless RawReviewResult → ValidationEngine → ValidatedReviewResult", async () => {
  // --- Agentless produces a RawReviewResult (fenced output from the provider) ---
  const rawDiffStorage = new InMemoryRawDiffStorage();
  const snapshot = buildSnapshot();
  await rawDiffStorage.saveRawDiff(snapshot.snapshotId, sampleDiff());

  const agentless = new AgentlessArchitecture({
    provider: new MockProvider({ response: { text: FENCED_MODEL_OUTPUT, inputTokens: 700, outputTokens: 120, latencyMs: 950, estimatedCostUsd: 0.0033 } }),
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
  const raw = await agentless.execute(input);

  // Agentless does NOT validate: its best-effort surfacing can't read fenced JSON.
  assert.equal(raw.summary, "");
  assert.equal(raw.rawOutput, FENCED_MODEL_OUTPUT);

  // --- ValidationEngine converts the raw result into a validated one ---
  const validated = await new ValidationEngine().validate(raw, {
    promptVersion: input.promptVersion,
    experimentId: input.experimentId,
  });

  // Summary + findings recovered and normalized from the fenced output.
  assert.equal(validated.summary, "Adds a null guard and a stub component; low risk.");
  assert.equal(validated.findings.length, 1);
  assert.equal(validated.findings[0]?.id, "finding-1");
  assert.equal(validated.findings[0]?.severity, "medium"); // normalized from MEDIUM
  assert.equal(validated.findings[0]?.category, "maintainability"); // normalized case
  assert.equal(validated.findings[0]?.confidence, 0.7);

  // Repair metadata and carried-through execution metrics.
  assert.equal(validated.validation.repaired, true);
  assert.ok(validated.validation.repairActions.includes("removed markdown code fences"));
  assert.equal(validated.validation.promptVersion, "v1");
  assert.equal(validated.architecture, "agentless");
  assert.equal(validated.llmCalls, 1);
  assert.equal(validated.latencyMs, 950);
  assert.equal(validated.inputTokens, 700);
  assert.equal(validated.outputTokens, 120);
  assert.equal(validated.estimatedCostUsd, 0.0033);
});
