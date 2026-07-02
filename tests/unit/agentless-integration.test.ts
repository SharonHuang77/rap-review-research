import { test } from "node:test";
import assert from "node:assert/strict";

import { createPRImportService } from "../../src/services/snapshot/index.ts";
import { createExperimentService } from "../../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryExperimentRepository } from "../../src/repositories/in-memory/in-memory-experiment-repository.ts";
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

test("Agentless runs through the registry + engine on an imported snapshot", async () => {
  // Shared infra between PR import and the experiment run.
  const snapshots = new InMemorySnapshotRepository();
  const rawDiffStorage = new InMemoryRawDiffStorage();
  const experiments = new InMemoryExperimentRepository();

  // Register Agentless (backed by a MockProvider — no Bedrock) in the registry.
  let providerCalls = 0;
  const registry = new InMemoryArchitectureRegistry();
  registry.register(
    new AgentlessArchitecture({
      provider: new MockProvider({ onReview: () => (providerCalls += 1) }),
      promptBuilder: new PromptBuilder({
        loader: new PromptLoader(),
        contextBuilder: new ContextBuilder(),
      }),
      rawDiffStorage,
    }),
  );

  // 1. Import the sample diff -> immutable snapshot.
  const importCtx = createPRImportService({
    snapshots,
    rawDiffStorage,
    idGenerator: new DefaultSnapshotIdGenerator(),
    clock: new FixedClock(),
  });
  const imported = await importCtx.service.importManualDiff({
    title: "Sample",
    source: "manual",
    rawDiff: sampleDiff(),
  });

  // 2. Run the experiment through the engine (resolves Agentless via registry).
  const experimentCtx = createExperimentService({
    snapshots,
    experiments,
    registry,
    idGenerator: new DefaultIdGenerator(),
    clock: new FixedClock(),
  });
  const result = await experimentCtx.service.runExperiment({
    snapshotId: imported.snapshotId,
    architecture: "agentless",
    modelVersion: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    promptVersion: "v1",
    workflowVersion: "workflow-v1",
    evaluationVersion: "eval-v1",
  });

  assert.equal(result.status, "completed");
  assert.equal(providerCalls, 1); // exactly one provider call end-to-end
  assert.deepEqual(experiments.statusHistory(result.experimentId), [
    "created",
    "queued",
    "running",
    "validating",
    "evaluating",
    "completed",
  ]);
});
