import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  IStorageEngine,
  StoreRawResultInput,
  StoreValidatedResultInput,
} from "../../src/storage/storage-engine.ts";
import type { StoredExperimentResult } from "../../src/storage/stored-models.ts";
import type { PRSnapshot } from "../../src/models/snapshot.ts";
import type { SnapshotReadPort } from "../../src/workbench/ports.ts";

import {
  ReplayService,
  ComparisonService,
  MetricsService,
  ExportHistoryService,
  WorkbenchService,
  InMemoryExperimentReadStore,
  InMemoryConversationStore,
  InMemoryExportHistoryStore,
  WorkbenchArtifactUnavailableError,
} from "../../src/workbench/index.ts";
import { EvaluationEngine } from "../../src/evaluation/index.ts";
import { ExperimentNotFoundError } from "../../src/shared/errors.ts";

import { buildExperiment, buildConversation } from "./support/workbench.ts";
import { buildStoredResult } from "./support/stored-results.ts";

/** Minimal in-memory IStorageEngine seeded with pre-built stored results. */
class FakeStorage implements IStorageEngine {
  private readonly byId = new Map<string, StoredExperimentResult>();
  public seed(result: StoredExperimentResult): void {
    this.byId.set(result.experimentId, result);
  }
  public async storeRawResult(_input: StoreRawResultInput): Promise<void> {}
  public async storeValidatedResult(
    _input: StoreValidatedResultInput,
  ): Promise<void> {}
  public async getExperimentResult(
    experimentId: string,
  ): Promise<StoredExperimentResult | null> {
    return this.byId.get(experimentId) ?? null;
  }
}

const snapshotPort = (snapshot: PRSnapshot | null): SnapshotReadPort => ({
  async getById() {
    return snapshot;
  },
});

// ---- ReplayService ----

test("ReplayService builds a replay from a recorded conversation", async () => {
  const experiments = new InMemoryExperimentReadStore();
  experiments.add(buildExperiment({ architecture: "consensus" }));
  const conversations = new InMemoryConversationStore();
  conversations.record(
    "snap_001#agentless#m#v1#w1#e1",
    buildConversation([{ type: "vote-request" }, { type: "vote-response" }]),
  );

  const service = new ReplayService({ experiments, conversations });
  const view = await service.getReplay("snap_001#agentless#m#v1#w1#e1");
  assert.equal(view.stepCount, 2);
  assert.equal(view.architecture, "consensus");
});

test("ReplayService throws for an unknown experiment", async () => {
  const service = new ReplayService({
    experiments: new InMemoryExperimentReadStore(),
    conversations: new InMemoryConversationStore(),
  });
  await assert.rejects(
    () => service.getReplay("missing"),
    (e: unknown) => e instanceof ExperimentNotFoundError,
  );
});

// ---- ComparisonService ----

test("ComparisonService compares all architectures for one snapshot", async () => {
  const experiments = new InMemoryExperimentReadStore();
  experiments.add(
    buildExperiment({ experimentId: "snap_001#agentless#m#v1#w1#e1" }),
  );
  experiments.add(
    buildExperiment({
      experimentId: "snap_001#hierarchical#m#v1#w1#e1",
      architecture: "hierarchical",
    }),
  );
  // An experiment for a different snapshot must be excluded.
  experiments.add(
    buildExperiment({
      experimentId: "snap_999#agentless#m#v1#w1#e1",
      snapshotId: "snap_999",
    }),
  );

  const storage = new FakeStorage();
  storage.seed(buildStoredResult({ experimentId: "snap_001#agentless#m#v1#w1#e1" }));
  storage.seed(
    buildStoredResult({
      experimentId: "snap_001#hierarchical#m#v1#w1#e1",
      architecture: "hierarchical",
    }),
  );
  storage.seed(buildStoredResult({ experimentId: "snap_999#agentless#m#v1#w1#e1" }));

  const service = new ComparisonService({
    experiments,
    storage,
    evaluation: new EvaluationEngine(),
  });
  const view = await service.getComparison("snap_001");
  assert.equal(view.snapshotId, "snap_001");
  assert.equal(view.architectures.length, 2);
  const names = view.architectures.map((a) => a.architecture).sort();
  assert.deepEqual(names, ["agentless", "hierarchical"]);
});

test("ComparisonService returns an empty view for an unknown snapshot", async () => {
  const service = new ComparisonService({
    experiments: new InMemoryExperimentReadStore(),
    storage: new FakeStorage(),
    evaluation: new EvaluationEngine(),
  });
  const view = await service.getComparison("nope");
  assert.equal(view.architectures.length, 0);
});

// ---- MetricsService ----

test("MetricsService aggregates evaluated metrics for one experiment", async () => {
  const storage = new FakeStorage();
  storage.seed(buildStoredResult({ experimentId: "e1" }));
  const service = new MetricsService({
    storage,
    evaluation: new EvaluationEngine(),
  });
  const view = await service.getMetrics("e1");
  assert.equal(view.experimentId, "e1");
  assert.ok(view.cost.totalTokens > 0);
  assert.ok(view.quality.findingCount >= 1);
});

test("MetricsService throws when the experiment is unknown", async () => {
  const service = new MetricsService({
    storage: new FakeStorage(),
    evaluation: new EvaluationEngine(),
  });
  await assert.rejects(
    () => service.getMetrics("missing"),
    (e: unknown) => e instanceof ExperimentNotFoundError,
  );
});

test("MetricsService throws when there is no validated result", async () => {
  const storage = new FakeStorage();
  storage.seed(buildStoredResult({ experimentId: "e1", validated: false }));
  const service = new MetricsService({
    storage,
    evaluation: new EvaluationEngine(),
  });
  await assert.rejects(
    () => service.getMetrics("e1"),
    (e: unknown) => e instanceof WorkbenchArtifactUnavailableError,
  );
});

// ---- ExportHistoryService ----

test("ExportHistoryService projects recorded exports", async () => {
  const history = new InMemoryExportHistoryStore();
  history.record({
    format: "csv",
    fileName: "x.csv",
    content: "h",
    rowCount: 2,
    generatedAt: "t1",
  });
  history.record({
    format: "json",
    fileName: "x.json",
    content: "[]",
    rowCount: 2,
    generatedAt: "t2",
  });
  const service = new ExportHistoryService({ history });
  const view = await service.getExportHistory();
  assert.equal(view.totalExports, 2);
  assert.equal(view.csvCount, 1);
  assert.equal(view.jsonCount, 1);
});

// ---- WorkbenchService orchestration ----

test("WorkbenchService lists experiments and builds a detail view with metrics", async () => {
  const experiments = new InMemoryExperimentReadStore();
  experiments.add(buildExperiment({ experimentId: "e1", snapshotId: "snap_001" }));
  const storage = new FakeStorage();
  storage.seed(buildStoredResult({ experimentId: "e1" }));

  const snapshot: PRSnapshot = {
    snapshotId: "snap_001",
    source: "manual",
    title: "Test PR",
    rawDiffS3Key: "k",
    changedFiles: [
      {
        path: "a.ts",
        changeType: "modified",
        additions: 3,
        deletions: 1,
        changedLineRanges: [],
      },
    ],
    totalChangedLines: 4,
    category: "backend",
    complexity: "small",
    importedAt: "t",
  };

  const evaluation = new EvaluationEngine();
  const workbench = new WorkbenchService({
    experiments,
    snapshots: snapshotPort(snapshot),
    storage,
    evaluation,
    replayService: new ReplayService({
      experiments,
      conversations: new InMemoryConversationStore(),
    }),
    comparisonService: new ComparisonService({ experiments, storage, evaluation }),
    metricsService: new MetricsService({ storage, evaluation }),
    exportHistoryService: new ExportHistoryService({
      history: new InMemoryExportHistoryStore(),
    }),
  });

  const list = await workbench.getExperiments();
  assert.equal(list.length, 1);
  assert.equal(list[0]!.experimentId, "e1");

  const detail = await workbench.getExperiment("e1");
  assert.equal(detail.pr?.title, "Test PR");
  assert.equal(detail.pr?.changedFileCount, 1);
  assert.ok(detail.metrics);
  assert.equal(detail.metrics!.experimentId, "e1");
});

test("WorkbenchService.getExperiment throws for an unknown id", async () => {
  const experiments = new InMemoryExperimentReadStore();
  const storage = new FakeStorage();
  const evaluation = new EvaluationEngine();
  const workbench = new WorkbenchService({
    experiments,
    snapshots: snapshotPort(null),
    storage,
    evaluation,
    replayService: new ReplayService({
      experiments,
      conversations: new InMemoryConversationStore(),
    }),
    comparisonService: new ComparisonService({ experiments, storage, evaluation }),
    metricsService: new MetricsService({ storage, evaluation }),
    exportHistoryService: new ExportHistoryService({
      history: new InMemoryExportHistoryStore(),
    }),
  });
  await assert.rejects(
    () => workbench.getExperiment("missing"),
    (e: unknown) => e instanceof ExperimentNotFoundError,
  );
});
