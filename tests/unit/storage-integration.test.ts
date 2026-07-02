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

/** Wire PR import + experiment engine (with default storage) over shared infra. */
function wire(providerText: string) {
  const snapshots = new InMemorySnapshotRepository();
  const rawDiffStorage = new InMemoryRawDiffStorage();

  const registry = new InMemoryArchitectureRegistry();
  registry.register(
    new AgentlessArchitecture({
      provider: new MockProvider({ response: { text: providerText } }),
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
  return { importCtx, experimentCtx };
}

const RUN_INPUT = {
  architecture: "agentless" as const,
  modelVersion: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  promptVersion: "v1",
  workflowVersion: "workflow-v1",
  evaluationVersion: "eval-v1",
};

test("full pipeline stores raw + validated + findings", async () => {
  const modelOutput = JSON.stringify({
    summary: "One medium issue found.",
    riskLevel: "medium",
    findings: [
      {
        title: "Stub component",
        severity: "MEDIUM",
        category: "Maintainability",
        file: "src/components/UserList.tsx",
        line: 2,
        description: "Returns null.",
        recommendation: "Implement it.",
        confidence: 0.7,
      },
    ],
  });
  const { importCtx, experimentCtx } = wire(modelOutput);

  const imported = await importCtx.service.importManualDiff({
    title: "Sample",
    source: "manual",
    rawDiff: sampleDiff(),
  });
  const run = await experimentCtx.service.runExperiment({
    snapshotId: imported.snapshotId,
    ...RUN_INPUT,
  });
  assert.equal(run.status, "completed");

  const stored = await experimentCtx.storage.getExperimentResult(run.experimentId);
  assert.ok(stored);
  // Raw preserved exactly (fenced-or-not model text as-is).
  assert.equal(stored?.rawResult?.rawOutput, modelOutput);
  assert.equal(stored?.rawResult?.architecture, "agentless");
  // Validated stored, normalized, with metadata.
  assert.equal(stored?.validatedResult?.summary, "One medium issue found.");
  assert.equal(stored?.validatedResult?.findings[0]?.severity, "medium");
  assert.equal(stored?.validatedResult?.validation.promptVersion, "v1");
  // Findings stored separately.
  assert.equal(stored?.findings.length, 1);
  assert.equal(stored?.findings[0]?.experimentId, run.experimentId);
});

test("validation failure preserves the raw result but stores no validated result", async () => {
  const { importCtx, experimentCtx } = wire("this is not json at all");

  const imported = await importCtx.service.importManualDiff({
    title: "Sample",
    source: "manual",
    rawDiff: sampleDiff(),
  });
  const run = await experimentCtx.service.runExperiment({
    snapshotId: imported.snapshotId,
    ...RUN_INPUT,
  });
  assert.equal(run.status, "failed");

  const stored = await experimentCtx.storage.getExperimentResult(run.experimentId);
  assert.ok(stored?.rawResult, "raw result preserved despite validation failure");
  assert.equal(stored?.rawResult?.rawOutput, "this is not json at all");
  assert.equal(stored?.validatedResult, null);
  assert.deepEqual(stored?.findings, []);
});
