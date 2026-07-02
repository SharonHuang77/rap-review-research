import { test } from "node:test";
import assert from "node:assert/strict";

import { createPRImportService } from "../../src/services/snapshot/index.ts";
import { createExperimentService } from "../../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../../src/architectures/in-memory-architecture-registry.ts";
import { createConsensusArchitecture } from "../../src/architectures/consensus/index.ts";
import { PromptBuilder } from "../../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../../src/llm/prompts/context-builder.ts";
import { MockProvider } from "../../src/llm/provider/mock-provider.ts";
import type { LLMReviewRequest } from "../../src/llm/models/llm-review-request.ts";
import { EvaluationEngine } from "../../src/evaluation/evaluation-engine.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import { DefaultIdGenerator, DefaultSnapshotIdGenerator } from "../../src/shared/id.ts";
import { sampleDiff } from "./support/diffs.ts";

const REVIEW_JSON = JSON.stringify({
  summary: "review",
  riskLevel: "medium",
  findings: [
    {
      title: "Shared concern",
      severity: "medium",
      category: "correctness",
      file: "src/api/users.ts",
      line: 11,
      description: "Something to check.",
      recommendation: "Check it.",
      confidence: 0.7,
    },
  ],
});
const VOTE_JSON = JSON.stringify({
  votes: [{ candidateId: "candidate-1", vote: "accept", reason: "agree", confidence: 0.8 }],
});

// Voting prompts get votes; review/revision prompts get a review.
function responder(request: LLMReviewRequest) {
  return request.systemPrompt.includes("voting round")
    ? { text: VOTE_JSON }
    : { text: REVIEW_JSON };
}

// full pipeline: sample.diff → import → engine → Consensus → validation → storage → evaluation
test("consensus runs end-to-end: 9 LLM calls, vote-accepted finding, evaluated", async () => {
  const snapshots = new InMemorySnapshotRepository();
  const rawDiffStorage = new InMemoryRawDiffStorage();

  const registry = new InMemoryArchitectureRegistry();
  registry.register(
    createConsensusArchitecture({
      provider: new MockProvider({ responder }),
      promptBuilder: new PromptBuilder({ loader: new PromptLoader(), contextBuilder: new ContextBuilder() }),
      rawDiffStorage,
      clock: new FixedClock(),
    }),
  );

  const importCtx = createPRImportService({
    snapshots,
    rawDiffStorage,
    idGenerator: new DefaultSnapshotIdGenerator(),
    clock: new FixedClock(),
  });
  const experimentCtx = createExperimentService({
    snapshots,
    registry,
    idGenerator: new DefaultIdGenerator(),
    clock: new FixedClock(),
  });

  const imported = await importCtx.service.importManualDiff({
    title: "Sample",
    source: "manual",
    rawDiff: sampleDiff(),
  });
  const run = await experimentCtx.service.runExperiment({
    snapshotId: imported.snapshotId,
    architecture: "consensus",
    modelVersion: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    promptVersion: "v1",
    workflowVersion: "workflow-v1",
    evaluationVersion: "eval-v1",
  });
  assert.equal(run.status, "completed");

  const stored = await experimentCtx.storage.getExperimentResult(run.experimentId);
  assert.ok(stored?.validatedResult);
  assert.equal(stored?.validatedResult?.llmCalls, 9); // 3 specialists × 3 rounds
  // more communication than Hierarchical (8): review(6) + exchange(3) + revision(6) + vote(6) + synthesis(1) = 22
  assert.equal(stored?.validatedResult?.messageCount, 22);
  // three identical findings → one candidate → accepted by 3 votes → one final finding
  assert.equal(stored?.validatedResult?.findings.length, 1);

  const metrics = new EvaluationEngine().evaluate(stored!);
  assert.equal(metrics.architecture, "consensus");
  assert.equal(metrics.reviewQuality.findingCount, 1);
  assert.equal(metrics.operationalCost.llmCalls, 9);
  assert.ok(metrics.researchEvidence.evidenceScore > 0);
});
