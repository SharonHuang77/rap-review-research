import { test } from "node:test";
import assert from "node:assert/strict";

import { createPRImportService } from "../../src/services/snapshot/index.ts";
import { createExperimentService } from "../../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../../src/architectures/in-memory-architecture-registry.ts";
import { AgentlessArchitecture } from "../../src/architectures/agentless/agentless-architecture.ts";
import { PromptBuilder } from "../../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../../src/llm/prompts/context-builder.ts";
import { MockProvider } from "../../src/llm/provider/mock-provider.ts";
import { EvaluationEngine } from "../../src/evaluation/evaluation-engine.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import { DefaultIdGenerator, DefaultSnapshotIdGenerator } from "../../src/shared/id.ts";
import { sampleDiff } from "./support/diffs.ts";

// full pipeline: sample.diff -> import -> engine -> agentless -> validation -> storage -> evaluation
test("evaluates a real stored experiment result end-to-end", async () => {
  const snapshots = new InMemorySnapshotRepository();
  const rawDiffStorage = new InMemoryRawDiffStorage();

  const modelOutput = JSON.stringify({
    summary: "One medium and one high issue.",
    riskLevel: "high",
    findings: [
      {
        title: "Stub component",
        severity: "MEDIUM",
        category: "Maintainability",
        file: "src/components/UserList.tsx",
        line: 2,
        description: "Returns null.",
        recommendation: "Implement it.",
        confidence: 0.6,
      },
      {
        title: "Missing null guard",
        severity: "high",
        category: "correctness",
        file: "src/api/users.ts",
        line: 11,
        description: "May throw.",
        recommendation: "Guard it.",
        confidence: 0.9,
      },
    ],
  });

  const registry = new InMemoryArchitectureRegistry();
  registry.register(
    new AgentlessArchitecture({
      provider: new MockProvider({ response: { text: modelOutput } }),
      promptBuilder: new PromptBuilder({
        loader: new PromptLoader(),
        contextBuilder: new ContextBuilder(),
      }),
      rawDiffStorage,
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
    architecture: "agentless",
    modelVersion: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    promptVersion: "v1",
    workflowVersion: "workflow-v1",
    evaluationVersion: "eval-v1",
  });
  assert.equal(run.status, "completed");

  const stored = await experimentCtx.storage.getExperimentResult(run.experimentId);
  assert.ok(stored);

  const engine = new EvaluationEngine();
  const metrics = engine.evaluate(stored!);

  assert.equal(metrics.architecture, "agentless");
  assert.equal(metrics.reviewQuality.findingCount, 2);
  assert.equal(metrics.reviewQuality.highSeverityCount, 1);
  assert.equal(metrics.reviewQuality.mediumSeverityCount, 1);
  assert.ok(metrics.researchEvidence.evidenceScore > 0);
  assert.ok(metrics.operationalCost.llmCalls === 1);

  const comparisons = engine.evaluateBatch([stored!]);
  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0]?.architectures.length, 1);
  assert.equal(comparisons[0]?.architectures[0]?.experimentId, run.experimentId);
});
