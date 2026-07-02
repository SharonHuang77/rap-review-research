import { test } from "node:test";
import assert from "node:assert/strict";

import { BackendReviewer } from "../../src/architectures/hierarchical/specialists/backend-reviewer.ts";
import { parseSpecialistReview } from "../../src/architectures/hierarchical/specialists/review-specialist.ts";
import { PromptBuilder } from "../../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../../src/llm/prompts/context-builder.ts";
import { MockProvider } from "../../src/llm/provider/mock-provider.ts";
import { InMemoryRawDiffStorage } from "../../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import type { LLMReviewRequest } from "../../src/llm/models/llm-review-request.ts";
import type { ReviewExecutionInput } from "../../src/models/review-result.ts";
import { buildSnapshot } from "./support/fixtures.ts";
import { sampleDiff } from "./support/diffs.ts";

const BACKEND_OUTPUT = JSON.stringify({
  summary: "Backend review",
  riskLevel: "high",
  findings: [
    {
      title: "Missing authorization",
      severity: "HIGH",
      category: "Security",
      file: "src/api/users.ts",
      line: 11,
      description: "No auth check.",
      recommendation: "Add a guard.",
      confidence: 0.9,
    },
  ],
});

test("BackendReviewer builds a role prompt and returns a SpecialistReviewResult", async () => {
  const calls: LLMReviewRequest[] = [];
  const rawDiffStorage = new InMemoryRawDiffStorage();
  const snapshot = buildSnapshot();
  await rawDiffStorage.saveRawDiff(snapshot.snapshotId, sampleDiff());

  const reviewer = new BackendReviewer({
    provider: new MockProvider({
      response: { text: BACKEND_OUTPUT, inputTokens: 300, outputTokens: 40, latencyMs: 500, estimatedCostUsd: 0.002 },
      onReview: (req) => calls.push(req),
    }),
    promptBuilder: new PromptBuilder({ loader: new PromptLoader(), contextBuilder: new ContextBuilder() }),
    rawDiffStorage,
  });

  const input: ReviewExecutionInput = {
    experimentId: "e",
    snapshot,
    modelVersion: "m",
    promptVersion: "v1",
    workflowVersion: "w1",
  };
  const result = await reviewer.review(input);

  assert.equal(result.role, "backend");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.id, "backend-1");
  assert.equal(result.findings[0]?.severity, "high"); // normalized from HIGH
  assert.equal(result.findings[0]?.category, "security");
  assert.equal(result.inputTokens, 300);
  assert.equal(result.estimatedCostUsd, 0.002);

  // Prompt used the backend role template.
  assert.match(calls[0]?.systemPrompt ?? "", /Backend Reviewer/);
});

test("parseSpecialistReview handles fences and skips incomplete findings", () => {
  const fenced = "```json\n" + BACKEND_OUTPUT + "\n```";
  const parsed = parseSpecialistReview(fenced, "backend");
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.summary, "Backend review");

  // A finding missing `recommendation` is skipped (no invention), not defaulted.
  const incomplete = JSON.stringify({
    summary: "s",
    findings: [{ title: "x", severity: "low", category: "c", file: "f", line: 1, description: "d", confidence: 0.5 }],
  });
  assert.equal(parseSpecialistReview(incomplete, "backend").findings.length, 0);

  // Non-JSON yields empty, never throws.
  assert.deepEqual(parseSpecialistReview("not json", "backend"), { summary: "", findings: [] });
});
