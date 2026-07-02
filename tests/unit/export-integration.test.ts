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
import {
  DefaultIdGenerator,
  DefaultSnapshotIdGenerator,
} from "../../src/shared/id.ts";
import { sampleDiff } from "./support/diffs.ts";
import {
  createExportService,
  STABLE_COLUMNS,
} from "../../src/export/index.ts";

// full pipeline: import -> experiment -> storage -> evaluation -> export (CSV + JSON)
test("exports evaluated comparisons produced by the real pipeline", async () => {
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

  const stored = await experimentCtx.storage.getExperimentResult(
    run.experimentId,
  );
  assert.ok(stored);

  const engine = new EvaluationEngine();
  const comparisons = engine.evaluateBatch([stored!]);
  assert.equal(comparisons.length, 1);

  const service = createExportService();
  const input = {
    generatedAt: "2026-06-28T12:00:00.000Z",
    comparisons,
  };

  const csv = await service.exportComparisons(input, "csv");
  const lines = csv.content.split("\n");
  assert.equal(lines[0], STABLE_COLUMNS.join(","));
  assert.equal(csv.rowCount, 1); // one architecture in one comparison
  const dataRow = lines[1]!.split(",");
  assert.equal(dataRow[STABLE_COLUMNS.indexOf("architecture")], "agentless");
  assert.equal(dataRow[STABLE_COLUMNS.indexOf("findingCount")], "2");

  const json = await service.exportComparisons(input, "json");
  const parsed = JSON.parse(json.content);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].architectures[0].reviewQuality.findingCount, 2);
  assert.equal(json.rowCount, 1);
});
