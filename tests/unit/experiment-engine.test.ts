import { test } from "node:test";
import assert from "node:assert/strict";

import { createExperimentService } from "../../src/services/experiment/create-experiment-service.ts";
import { InMemoryExperimentRepository } from "../../src/repositories/in-memory/in-memory-experiment-repository.ts";
import { InMemoryArchitectureRegistry } from "../../src/architectures/in-memory-architecture-registry.ts";
import { MockReviewArchitecture } from "../../src/architectures/mock/mock-review-architecture.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import { DefaultIdGenerator } from "../../src/shared/id.ts";
import {
  ExperimentNotFoundError,
  WorkflowError,
} from "../../src/shared/errors.ts";
import type { IReviewArchitecture } from "../../src/architectures/review-architecture.ts";
import type { RawReviewResult } from "../../src/models/review-result.ts";
import { buildSnapshot, buildRunInput } from "./support/fixtures.ts";

/**
 * Build a fully-wired engine context with deterministic clock/id, an in-memory
 * experiment repository we can inspect, a seeded snapshot, and (optionally) a
 * registered architecture.
 */
async function harness(architecture?: IReviewArchitecture) {
  const experiments = new InMemoryExperimentRepository();
  const registry = new InMemoryArchitectureRegistry();
  if (architecture) {
    registry.register(architecture);
  }
  const ctx = createExperimentService({
    experiments,
    registry,
    clock: new FixedClock("2026-01-01T00:00:00.000Z", 1000),
    idGenerator: new DefaultIdGenerator(),
  });
  await ctx.snapshots.create(buildSnapshot());
  return { ...ctx, experiments };
}

test("CREATED → RUNNING → COMPLETED with a mock architecture", async () => {
  let executions = 0;
  const mock = new MockReviewArchitecture({
    name: "agentless",
    onExecute: () => {
      executions += 1;
    },
  });
  const ctx = await harness(mock);

  const result = await ctx.engine.run(buildRunInput());

  assert.equal(result.status, "completed");
  assert.equal(result.reusedExisting, false);
  assert.equal(executions, 1);

  const history = ctx.experiments.statusHistory(result.experimentId);
  // Full lifecycle is honoured; the DoD subset must appear in order.
  assert.deepEqual(history, [
    "created",
    "queued",
    "running",
    "validating",
    "evaluating",
    "completed",
  ]);
});

test("execution-level metrics are captured on completion", async () => {
  const mock = new MockReviewArchitecture({
    name: "agentless",
    metrics: {
      inputTokens: 1234,
      outputTokens: 56,
      estimatedCostUsd: 0.42,
      latencyMs: 9999,
      messageCount: 3,
    },
  });
  const ctx = await harness(mock);

  const result = await ctx.engine.run(buildRunInput());
  const experiment = await ctx.experiments.findById(result.experimentId);

  assert.equal(experiment?.totalInputTokens, 1234);
  assert.equal(experiment?.totalOutputTokens, 56);
  assert.equal(experiment?.estimatedCostUsd, 0.42);
  assert.equal(experiment?.totalLatencyMs, 9999);
  assert.ok(experiment?.startedAt);
  assert.ok(experiment?.completedAt);
  // The deterministic clock advances on each read, so completion is after start.
  assert.ok(
    (experiment?.completedAt ?? "") > (experiment?.startedAt ?? ""),
  );
});

test("the architecture receives the snapshot and version inputs", async () => {
  let captured: { snapshotId?: string; modelVersion?: string } = {};
  const mock = new MockReviewArchitecture({
    name: "agentless",
    onExecute: (input) => {
      captured = {
        snapshotId: input.snapshot.snapshotId,
        modelVersion: input.modelVersion,
      };
    },
  });
  const ctx = await harness(mock);

  await ctx.engine.run(buildRunInput());
  assert.equal(captured.snapshotId, "snap_001");
  assert.equal(captured.modelVersion, "gpt-4.1");
});

test("re-running a completed experiment reuses it without re-executing", async () => {
  let executions = 0;
  const mock = new MockReviewArchitecture({
    name: "agentless",
    onExecute: () => {
      executions += 1;
    },
  });
  const ctx = await harness(mock);

  const first = await ctx.engine.run(buildRunInput());
  const second = await ctx.engine.run(buildRunInput());

  assert.equal(executions, 1);
  assert.equal(second.reusedExisting, true);
  assert.equal(second.status, "completed");
  assert.equal(second.experimentId, first.experimentId);
});

test("forceRerun creates a new versioned experiment and re-executes", async () => {
  let executions = 0;
  const mock = new MockReviewArchitecture({
    name: "agentless",
    onExecute: () => {
      executions += 1;
    },
  });
  const ctx = await harness(mock);

  const first = await ctx.engine.run(buildRunInput());
  const rerun = await ctx.engine.run(buildRunInput({ forceRerun: true }));

  assert.equal(executions, 2);
  assert.equal(rerun.reusedExisting, false);
  assert.notEqual(rerun.experimentId, first.experimentId);
  assert.ok(rerun.experimentId.includes("#rerun-1"));
});

test("architecture failure marks the experiment failed", async () => {
  const mock = new MockReviewArchitecture({
    name: "agentless",
    failWith: new WorkflowError("model exploded"),
  });
  const ctx = await harness(mock);

  const result = await ctx.engine.run(buildRunInput());
  assert.equal(result.status, "failed");
  assert.equal(result.reusedExisting, false);

  const experiment = await ctx.experiments.findById(result.experimentId);
  assert.equal(experiment?.status, "failed");
  assert.equal(experiment?.errorMessage, "model exploded");
});

test("a missing snapshot fails the experiment", async () => {
  const mock = new MockReviewArchitecture({ name: "agentless" });
  const ctx = await harness(mock);

  const result = await ctx.engine.run(
    buildRunInput({ snapshotId: "snap_missing" }),
  );
  assert.equal(result.status, "failed");
  const experiment = await ctx.experiments.findById(result.experimentId);
  assert.match(experiment?.errorMessage ?? "", /snap_missing/);
});

test("an unregistered architecture fails the experiment", async () => {
  // No architecture registered for "hierarchical".
  const ctx = await harness(new MockReviewArchitecture({ name: "agentless" }));

  const result = await ctx.engine.run(
    buildRunInput({ architecture: "hierarchical" }),
  );
  assert.equal(result.status, "failed");
});

test("a failed experiment can be retried to completion", async () => {
  let shouldFail = true;
  const toggling: IReviewArchitecture = {
    name: "agentless",
    async execute(): Promise<RawReviewResult> {
      if (shouldFail) {
        shouldFail = false;
        throw new WorkflowError("transient failure");
      }
      return {
        architecture: "agentless",
        summary: "ok",
        rawOutput: {
          architecture: "agentless",
          summary: "ok",
          riskLevel: "low",
          findings: [],
          messageCount: 1,
        },
        findings: [],
        inputTokens: 10,
        outputTokens: 5,
        estimatedCostUsd: 0.001,
        latencyMs: 100,
        messageCount: 1,
      };
    },
  };
  const ctx = await harness(toggling);

  const failed = await ctx.engine.run(buildRunInput());
  assert.equal(failed.status, "failed");

  const retried = await ctx.engine.retry(failed.experimentId);
  assert.equal(retried.status, "completed");
  assert.equal(retried.experimentId, failed.experimentId);

  const history = ctx.experiments.statusHistory(failed.experimentId);
  // failed → queued is part of the retry path.
  assert.ok(history.includes("failed"));
  assert.ok(history.lastIndexOf("completed") > history.indexOf("failed"));
});

test("getStatus returns the current status, or throws when unknown", async () => {
  const ctx = await harness(new MockReviewArchitecture({ name: "agentless" }));
  const result = await ctx.engine.run(buildRunInput());

  assert.equal(await ctx.engine.getStatus(result.experimentId), "completed");
  await assert.rejects(
    () => ctx.engine.getStatus("missing"),
    ExperimentNotFoundError,
  );
});

test("retry throws for an unknown experiment", async () => {
  const ctx = await harness(new MockReviewArchitecture({ name: "agentless" }));
  await assert.rejects(
    () => ctx.engine.retry("missing"),
    ExperimentNotFoundError,
  );
});
