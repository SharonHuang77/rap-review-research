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
import { FixedClock } from "../../src/shared/clock.ts";
import {
  DefaultIdGenerator,
  DefaultSnapshotIdGenerator,
} from "../../src/shared/id.ts";
import { sampleDiff } from "./support/diffs.ts";

import { EvaluationEngine } from "../../src/evaluation/index.ts";
import { createExportService } from "../../src/export/index.ts";
import { createResearchWorkbench } from "../../src/workbench/index.ts";

// full pipeline: import -> experiment -> storage -> evaluation -> export -> workbench
test("workbench presents artifacts produced by the real pipeline", async () => {
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

  const experiment = await experimentCtx.experiments.findById(run.experimentId);
  assert.ok(experiment);
  const stored = await experimentCtx.storage.getExperimentResult(run.experimentId);
  assert.ok(stored);

  // Wire the Workbench to the SAME storage + snapshot repo the pipeline used.
  const wb = createResearchWorkbench({
    storage: experimentCtx.storage,
    snapshots,
  });
  wb.experiments.add(experiment!);

  // Produce an export via RFC-10 and record its metadata (Workbench never
  // generates exports itself).
  const comparisons = new EvaluationEngine().evaluateBatch([stored!]);
  const exportResult = await createExportService().exportComparisons(
    { generatedAt: "2026-07-02T00:00:00.000Z", comparisons },
    "csv",
  );
  wb.exportHistory.record(exportResult);

  // --- Experiment list + detail ---
  const list = await wb.workbench.getExperiments();
  assert.equal(list.length, 1);
  assert.equal(list[0]!.experimentId, run.experimentId);

  const detail = await wb.workbench.getExperiment(run.experimentId);
  assert.equal(detail.pr?.snapshotId, imported.snapshotId);
  assert.equal(detail.findings.length, 2);
  assert.ok(detail.metrics);
  assert.equal(detail.metrics!.reviewQuality.findingCount, 2);

  // --- Comparison ---
  const comparison = await wb.workbench.getComparison(imported.snapshotId);
  assert.equal(comparison.architectures.length, 1);
  assert.equal(comparison.architectures[0]!.architecture, "agentless");
  assert.equal(comparison.architectures[0]!.findingCount, 2);

  // --- Metrics ---
  const metrics = await wb.workbench.getMetrics(run.experimentId);
  assert.equal(metrics.quality.findingCount, 2);
  assert.ok(metrics.cost.totalTokens > 0);

  // --- Replay (agentless has no conversation) ---
  const replay = await wb.workbench.getReplay(run.experimentId);
  assert.equal(replay.stepCount, 0);

  // --- Export history ---
  const history = await wb.workbench.getExportHistory();
  assert.equal(history.totalExports, 1);
  assert.equal(history.csvCount, 1);
  assert.equal(history.items[0]!.rowCount, exportResult.rowCount);
});
