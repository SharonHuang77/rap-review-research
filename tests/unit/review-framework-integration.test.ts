import { test } from "node:test";
import assert from "node:assert/strict";

import { createPRImportService } from "../../src/services/snapshot/index.ts";
import { createExperimentService } from "../../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryExperimentRepository } from "../../src/repositories/in-memory/in-memory-experiment-repository.ts";
import { InMemoryArchitectureRegistry } from "../../src/architectures/in-memory-architecture-registry.ts";
import { MockReviewArchitecture } from "../../src/architectures/mock/mock-review-architecture.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import {
  DefaultIdGenerator,
  DefaultSnapshotIdGenerator,
} from "../../src/shared/id.ts";
import type { ReviewExecutionInput } from "../../src/models/review-result.ts";
import { sampleDiff } from "./support/diffs.ts";

/**
 * Wire RFC-02 (import) and RFC-01 (engine) over a shared snapshot repository,
 * with the mock architecture (RFC-03) registered in the registry.
 */
function wire() {
  const snapshots = new InMemorySnapshotRepository();
  const experiments = new InMemoryExperimentRepository();
  const registry = new InMemoryArchitectureRegistry();

  let received: ReviewExecutionInput | null = null;
  registry.register(
    new MockReviewArchitecture({
      name: "agentless",
      onExecute: (input) => {
        received = input;
      },
    }),
  );

  const importCtx = createPRImportService({
    snapshots,
    idGenerator: new DefaultSnapshotIdGenerator(),
    clock: new FixedClock(),
  });
  const experimentCtx = createExperimentService({
    snapshots,
    experiments,
    registry,
    idGenerator: new DefaultIdGenerator(),
    clock: new FixedClock(),
  });

  return {
    importService: importCtx.service,
    experimentService: experimentCtx.service,
    experiments,
    getReceived: () => received,
  };
}

test("mock architecture runs end-to-end on a real imported PR snapshot", async () => {
  const w = wire();

  const imported = await w.importService.importManualDiff({
    title: "Add user filtering + list component",
    source: "manual",
    rawDiff: sampleDiff(),
  });

  const result = await w.experimentService.runExperiment({
    snapshotId: imported.snapshotId,
    architecture: "agentless",
    modelVersion: "gpt-4.1",
    promptVersion: "prompt-v1",
    workflowVersion: "workflow-v1",
    evaluationVersion: "eval-v1",
  });

  // Completed end-to-end without seeding a snapshot.
  assert.equal(result.status, "completed");
  assert.equal(result.reusedExisting, false);

  // The architecture received the *imported* snapshot (2 changed files).
  const received = w.getReceived();
  assert.equal(received?.snapshot.snapshotId, imported.snapshotId);
  assert.equal(received?.snapshot.changedFiles.length, 2);

  // Full lifecycle reached completion.
  assert.deepEqual(w.experiments.statusHistory(result.experimentId), [
    "created",
    "queued",
    "running",
    "validating",
    "evaluating",
    "completed",
  ]);
});

test("running an architecture that is not registered fails the experiment", async () => {
  const w = wire(); // only "agentless" is registered

  const imported = await w.importService.importManualDiff({
    title: "X",
    source: "manual",
    rawDiff: sampleDiff(),
  });

  const result = await w.experimentService.runExperiment({
    snapshotId: imported.snapshotId,
    architecture: "consensus",
    modelVersion: "gpt-4.1",
    promptVersion: "prompt-v1",
    workflowVersion: "workflow-v1",
    evaluationVersion: "eval-v1",
  });

  assert.equal(result.status, "failed");
});
