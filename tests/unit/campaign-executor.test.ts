import { test } from "node:test";
import assert from "node:assert/strict";

import type { ExperimentService } from "../../src/services/experiment/experiment-service.ts";
import type {
  IStorageEngine,
  StoreRawResultInput,
  StoreValidatedResultInput,
} from "../../src/storage/storage-engine.ts";
import type { StoredExperimentResult } from "../../src/storage/stored-models.ts";
import type {
  RunExperimentInput,
  RunExperimentResult,
} from "../../src/models/experiment.ts";
import type { BenchmarkInstance } from "../../src/benchmark/index.ts";

import { ExperimentExecutor } from "../../src/campaign/index.ts";
import { EvaluationEngine } from "../../src/evaluation/index.ts";
import { GroundTruthEvaluator, BenchmarkRunError } from "../../src/benchmark/index.ts";
import { buildStoredResult, buildFinding } from "./support/stored-results.ts";

const VERSIONS = {
  modelVersion: "m",
  promptVersion: "v1",
  workflowVersion: "w1",
  evaluationVersion: "e1",
};

const INSTANCE: BenchmarkInstance = {
  instanceId: "q1",
  title: "Q1",
  source: "qodo-pr-review-bench",
  rawDiff: "diff",
  groundTruth: [{ id: "g1", file: "src/a.ts", lineStart: 1, lineEnd: 1 }],
};

function experimentServiceReturning(
  result: RunExperimentResult,
): ExperimentService {
  return {
    async runExperiment(_input: RunExperimentInput) {
      return result;
    },
  } as unknown as ExperimentService;
}

function storageReturning(
  stored: StoredExperimentResult | null,
): IStorageEngine {
  return {
    async storeRawResult(_i: StoreRawResultInput) {},
    async storeValidatedResult(_i: StoreValidatedResultInput) {},
    async getExperimentResult() {
      return stored;
    },
  };
}

function buildExecutor(experimentService: ExperimentService, storage: IStorageEngine) {
  return new ExperimentExecutor({
    experimentService,
    storage,
    evaluationEngine: new EvaluationEngine(),
    groundTruthEvaluator: new GroundTruthEvaluator(),
    versions: VERSIONS,
  });
}

test("executes a run and returns benchmark result + metrics", async () => {
  const stored = buildStoredResult({
    experimentId: "snap-1#agentless#m#v1#w1#e1",
    findings: [buildFinding({ file: "src/a.ts", line: 1 })],
  });
  const executor = buildExecutor(
    experimentServiceReturning({
      experimentId: "snap-1#agentless#m#v1#w1#e1",
      status: "completed",
      reusedExisting: false,
    }),
    storageReturning(stored),
  );

  const outcome = await executor.execute({
    datasetId: "qodo",
    instance: INSTANCE,
    snapshotId: "snap-1",
    architecture: "agentless",
    run: 1,
  });

  assert.equal(outcome.snapshotId, "snap-1");
  assert.equal(outcome.benchmarkResult.truePositives, 1);
  assert.equal(outcome.benchmarkResult.instanceId, "q1");
  assert.ok(outcome.metrics.reviewQuality.findingCount >= 1);
});

test("throws when the experiment did not complete", async () => {
  const executor = buildExecutor(
    experimentServiceReturning({
      experimentId: "x",
      status: "failed",
      reusedExisting: false,
    }),
    storageReturning(null),
  );
  await assert.rejects(
    () =>
      executor.execute({
        datasetId: "qodo",
        instance: INSTANCE,
        snapshotId: "snap-1",
        architecture: "agentless",
        run: 1,
      }),
    (e: unknown) => e instanceof BenchmarkRunError,
  );
});

test("throws when no validated result was stored", async () => {
  const executor = buildExecutor(
    experimentServiceReturning({
      experimentId: "x",
      status: "completed",
      reusedExisting: false,
    }),
    storageReturning(null),
  );
  await assert.rejects(
    () =>
      executor.execute({
        datasetId: "qodo",
        instance: INSTANCE,
        snapshotId: "snap-1",
        architecture: "agentless",
        run: 1,
      }),
    (e: unknown) => e instanceof BenchmarkRunError,
  );
});
