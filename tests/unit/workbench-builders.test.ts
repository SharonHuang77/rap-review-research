import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ReplayViewBuilder,
  ComparisonViewBuilder,
  MetricsViewBuilder,
  ExportHistoryViewBuilder,
  ExperimentSummaryViewBuilder,
  ExperimentDetailViewBuilder,
} from "../../src/workbench/index.ts";
import type { ExperimentComparison } from "../../src/evaluation/models/experiment-comparison.ts";
import type { ExportRecord } from "../../src/workbench/models/export-history-view.ts";

import {
  buildExperiment,
  buildMetrics,
  buildConversation,
} from "./support/workbench.ts";

test("ReplayViewBuilder projects conversation messages into ordered steps", () => {
  const history = buildConversation([
    { from: "coordinator", to: "backend", type: "review-request" },
    { from: "backend", to: "coordinator", type: "review-response" },
    { from: "backend", to: "frontend", type: "vote-response" },
  ]);
  const view = new ReplayViewBuilder().build({
    experimentId: "exp-1",
    architecture: "consensus",
    history,
  });

  assert.equal(view.stepCount, 3);
  assert.equal(view.steps[0]!.index, 0);
  assert.equal(view.steps[0]!.actor, "coordinator");
  assert.equal(view.steps[0]!.messageType, "review-request");
  assert.equal(view.steps[1]!.actor, "backend");
  assert.equal(view.steps[2]!.to, "frontend");
});

test("ReplayViewBuilder returns an empty replay when there is no history", () => {
  const view = new ReplayViewBuilder().build({
    experimentId: "exp-1",
    architecture: "agentless",
    history: null,
  });
  assert.equal(view.stepCount, 0);
  assert.deepEqual(view.steps, []);
});

test("ComparisonViewBuilder flattens metrics into rows and charts", () => {
  const comparison: ExperimentComparison = {
    experimentId: "snap_001",
    architectures: [
      buildMetrics({ architecture: "agentless", findingCount: 2 }),
      buildMetrics({ architecture: "hierarchical", findingCount: 5 }),
    ],
  };
  const view = new ComparisonViewBuilder().build({
    snapshotId: "snap_001",
    comparison,
  });

  assert.equal(view.snapshotId, "snap_001");
  assert.equal(view.architectures.length, 2);
  assert.equal(view.architectures[0]!.findingCount, 2);
  assert.deepEqual(view.architectures[0]!.severityDistribution, {
    low: 1,
    medium: 1,
    high: 1,
    critical: 0,
  });
  const findingChart = view.charts.find((c) => c.title === "Finding Count");
  assert.ok(findingChart);
  assert.deepEqual(findingChart!.labels, ["agentless", "hierarchical"]);
  assert.deepEqual(findingChart!.values, [2, 5]);
});

test("ComparisonViewBuilder yields an empty view for a null comparison", () => {
  const view = new ComparisonViewBuilder().build({
    snapshotId: "snap_x",
    comparison: null,
  });
  assert.equal(view.architectures.length, 0);
  // charts still present, each with empty series
  assert.ok(view.charts.every((c) => c.values.length === 0));
});

test("MetricsViewBuilder builds cost and quality analyses without recomputing", () => {
  const view = new MetricsViewBuilder().build(buildMetrics());
  assert.equal(view.cost.totalTokens, 750); // 500 + 250
  assert.equal(view.cost.estimatedCostUsd, 0.0123);
  assert.equal(view.quality.findingCount, 3);
  assert.equal(view.quality.evidenceScore, 0.8);
  const severity = view.quality.charts.find(
    (c) => c.title === "Severity Distribution",
  );
  assert.deepEqual(severity!.values, [1, 1, 1, 0]);
});

test("ExportHistoryViewBuilder rolls up format counts", () => {
  const records: ExportRecord[] = [
    { format: "csv", fileName: "a.csv", rowCount: 3, generatedAt: "t1" },
    { format: "json", fileName: "b.json", rowCount: 3, generatedAt: "t2" },
    { format: "csv", fileName: "c.csv", rowCount: 1, generatedAt: "t3" },
  ];
  const view = new ExportHistoryViewBuilder().build(records);
  assert.equal(view.totalExports, 3);
  assert.equal(view.csvCount, 2);
  assert.equal(view.jsonCount, 1);
  assert.equal(view.items[0]!.fileName, "a.csv");
});

test("ExperimentSummaryViewBuilder projects list columns", () => {
  const view = new ExperimentSummaryViewBuilder().build(buildExperiment());
  assert.equal(view.experimentId, "snap_001#agentless#m#v1#w1#e1");
  assert.equal(view.snapshotId, "snap_001");
  assert.equal(view.architecture, "agentless");
  assert.equal(view.status, "completed");
  assert.equal(view.promptVersion, "v1");
});

test("ExperimentDetailViewBuilder composes summary, findings, and metrics", () => {
  const summary = new ExperimentSummaryViewBuilder().build(buildExperiment());
  const metrics = buildMetrics();
  const view = new ExperimentDetailViewBuilder().build({
    summary,
    snapshot: null,
    stored: {
      experimentId: summary.experimentId,
      rawResult: null,
      validatedResult: {
        experimentId: summary.experimentId,
        architecture: "agentless",
        summary: "Reviewed.",
        findings: [],
        validation: {
          schemaVersion: "review-result-v1",
          promptVersion: "v1",
          validationPassed: true,
          repaired: false,
          repairActions: [],
        },
        latencyMs: 1,
        inputTokens: 1,
        outputTokens: 1,
        estimatedCostUsd: 0,
        llmCalls: 1,
        messageCount: 1,
        storedAt: "t",
      },
      findings: [],
    },
    metrics,
  });

  assert.equal(view.summary.experimentId, summary.experimentId);
  assert.equal(view.reviewSummary, "Reviewed.");
  assert.equal(view.pr, null);
  assert.equal(view.metrics, metrics);
});
