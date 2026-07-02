import { test } from "node:test";
import assert from "node:assert/strict";

import { createPRImportService } from "../../src/services/snapshot/index.ts";
import { createExperimentService } from "../../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../../src/architectures/in-memory-architecture-registry.ts";
import { createHierarchicalArchitecture } from "../../src/architectures/hierarchical/index.ts";
import { PromptBuilder } from "../../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../../src/llm/prompts/context-builder.ts";
import { MockProvider } from "../../src/llm/provider/mock-provider.ts";
import { EvaluationEngine } from "../../src/evaluation/evaluation-engine.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import { DefaultIdGenerator, DefaultSnapshotIdGenerator } from "../../src/shared/id.ts";
import { sampleDiff } from "./support/diffs.ts";

// full pipeline: sample.diff → import → engine → Hierarchical → validation → storage → evaluation
test("hierarchical runs end-to-end with llmCalls > 1 and messageCount > 1", async () => {
  const snapshots = new InMemorySnapshotRepository();
  const rawDiffStorage = new InMemoryRawDiffStorage();

  // Every specialist shares this mock output → the three identical findings
  // exercise the Manager's duplicate resolution during synthesis.
  const specialistOutput = JSON.stringify({
    summary: "specialist review",
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

  const registry = new InMemoryArchitectureRegistry();
  registry.register(
    createHierarchicalArchitecture({
      provider: new MockProvider({ response: { text: specialistOutput } }),
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
    architecture: "hierarchical",
    modelVersion: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    promptVersion: "v1",
    workflowVersion: "workflow-v1",
    evaluationVersion: "eval-v1",
  });
  assert.equal(run.status, "completed");

  const stored = await experimentCtx.storage.getExperimentResult(run.experimentId);
  assert.ok(stored?.validatedResult);
  // 3 specialists → 3 LLM calls; 2 messages each + 2 merge messages = 8.
  assert.equal(stored?.validatedResult?.llmCalls, 3);
  assert.equal(stored?.validatedResult?.messageCount, 8);
  // Three identical findings merged down to one.
  assert.equal(stored?.validatedResult?.findings.length, 1);

  const metrics = new EvaluationEngine().evaluate(stored!);
  assert.equal(metrics.architecture, "hierarchical");
  assert.equal(metrics.reviewQuality.findingCount, 1);
  assert.equal(metrics.operationalCost.llmCalls, 3);
  assert.ok(metrics.researchEvidence.evidenceScore > 0);
});
