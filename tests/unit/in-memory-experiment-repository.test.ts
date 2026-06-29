import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryExperimentRepository } from "../../src/repositories/in-memory/in-memory-experiment-repository.ts";
import { InMemorySnapshotRepository } from "../../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { StorageError } from "../../src/shared/errors.ts";
import type { Experiment } from "../../src/models/experiment.ts";
import { buildSnapshot } from "./support/fixtures.ts";

function buildExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    experimentId: "exp_1",
    snapshotId: "snap_001",
    architecture: "agentless",
    modelVersion: "gpt-4.1",
    promptVersion: "prompt-v1",
    workflowVersion: "workflow-v1",
    evaluationVersion: "eval-v1",
    status: "created",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("create then findById returns a copy of the experiment", async () => {
  const repo = new InMemoryExperimentRepository();
  await repo.create(buildExperiment());

  const found = await repo.findById("exp_1");
  assert.equal(found?.experimentId, "exp_1");
  assert.equal(found?.status, "created");
});

test("create rejects duplicate experiment ids", async () => {
  const repo = new InMemoryExperimentRepository();
  await repo.create(buildExperiment());
  await assert.rejects(() => repo.create(buildExperiment()), StorageError);
});

test("findByIdempotencyKey resolves the matching experiment", async () => {
  const repo = new InMemoryExperimentRepository();
  await repo.create(buildExperiment());

  const found = await repo.findByIdempotencyKey(
    "snap_001#agentless#gpt-4.1#prompt-v1#workflow-v1#eval-v1",
  );
  assert.equal(found?.experimentId, "exp_1");

  const missing = await repo.findByIdempotencyKey("does#not#exist");
  assert.equal(missing, null);
});

test("findByIdempotencyKey returns the most recent matching experiment", async () => {
  const repo = new InMemoryExperimentRepository();
  await repo.create(buildExperiment({ experimentId: "exp_1" }));
  await repo.create(buildExperiment({ experimentId: "exp_2" }));

  const found = await repo.findByIdempotencyKey(
    "snap_001#agentless#gpt-4.1#prompt-v1#workflow-v1#eval-v1",
  );
  assert.equal(found?.experimentId, "exp_2");
});

test("updateStatus, markCompleted and markFailed mutate state and history", async () => {
  const repo = new InMemoryExperimentRepository();
  await repo.create(buildExperiment());

  await repo.updateStatus("exp_1", "running");
  await repo.markCompleted("exp_1", {
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:05.000Z",
    totalLatencyMs: 1200,
    totalInputTokens: 1000,
    totalOutputTokens: 250,
    estimatedCostUsd: 0.01,
    messageCount: 1,
  });

  const completed = await repo.findById("exp_1");
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.totalLatencyMs, 1200);
  assert.equal(completed?.completedAt, "2026-01-01T00:00:05.000Z");
  assert.deepEqual(repo.statusHistory("exp_1"), [
    "created",
    "running",
    "completed",
  ]);
});

test("operations on a missing experiment throw StorageError", async () => {
  const repo = new InMemoryExperimentRepository();
  await assert.rejects(() => repo.updateStatus("ghost", "running"), StorageError);
});

test("snapshot repository stores and resolves snapshots", async () => {
  const repo = new InMemorySnapshotRepository();
  assert.equal(await repo.findById("snap_001"), null);

  await repo.save(buildSnapshot());
  const found = await repo.findById("snap_001");
  assert.equal(found?.snapshotId, "snap_001");
  assert.equal(found?.prNumber, 1);
});
