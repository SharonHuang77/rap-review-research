import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CampaignRunner,
  InMemoryManifestStore,
  ProgressReporter,
  BENCHMARK_ARCHITECTURES,
} from "../../src/campaign/index.ts";
import type { CampaignConfig } from "../../src/campaign/index.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import {
  EXECUTION_CONFIG,
  buildBenchmarkPipeline,
  loadSampleDatasets,
} from "../../scripts/benchmark-shared.ts";

const CONFIG: CampaignConfig = {
  campaignId: "campaign-it",
  modelVersion: EXECUTION_CONFIG.modelVersion,
  promptVersion: EXECUTION_CONFIG.promptVersion,
  workflowVersion: EXECUTION_CONFIG.workflowVersion,
  evaluationVersion: EXECUTION_CONFIG.evaluationVersion,
  platformVersion: "v1.0.0",
  awsRegion: "us-west-2",
  generatedAt: "2026-07-02T12:00:00.000Z",
};

// full campaign: fixtures → import → 3 architectures per instance → validation →
// storage → evaluation → ground truth → summary + CSV/JSON. Mock provider.
test("runs a small benchmark campaign end-to-end across all three architectures", async () => {
  const { qodo, swe } = loadSampleDatasets();
  const { importService, experimentService, storage } = buildBenchmarkPipeline();

  const runner = new CampaignRunner({
    importService,
    experimentService,
    storage,
    reporter: new ProgressReporter({ clock: new FixedClock() }),
    manifestStore: new InMemoryManifestStore(),
    clock: new FixedClock(),
  });

  const report = await runner.run([qodo, swe], CONFIG);

  // 3 instances × 3 architectures.
  assert.equal(report.manifest.entries.length, 9);
  assert.equal(report.summary.progress.completed, 9);
  assert.equal(report.summary.progress.failed, 0);
  assert.equal(report.outcomes.length, 9);

  // Fairness: the three architectures for an instance share ONE snapshot.
  for (const instanceId of ["qodo-1", "qodo-2", "swe-1"]) {
    const snaps = new Set(
      report.outcomes.filter((o) => o.instanceId === instanceId).map((o) => o.snapshotId),
    );
    assert.equal(snaps.size, 1, `expected one snapshot for ${instanceId}`);
    const archs = report.outcomes
      .filter((o) => o.instanceId === instanceId)
      .map((o) => o.architecture)
      .sort();
    assert.deepEqual(archs, ["agentless", "consensus", "hierarchical"]);
  }

  // Per-architecture macro summary present for all three.
  assert.deepEqual(
    report.summary.perArchitecture.map((s) => s.architecture).sort(),
    ["agentless", "consensus", "hierarchical"],
  );

  // Campaign-level exports produced.
  const csvLines = report.exports.benchmarkCsv.split("\n");
  assert.equal(csvLines.length, 10); // header + 9 rows
  assert.ok(report.exports.comparisonsCsv.length > 0);
  assert.ok(report.exports.comparisonsJson.startsWith("["));
  const parsed = JSON.parse(report.exports.campaignJson);
  assert.equal(parsed.runs.length, 9);
  assert.equal(parsed.summary.campaignId, "campaign-it");

  // Reproducible logs: bookended by start/finish events.
  assert.ok(report.logs[0]!.includes("campaign-started"));
  assert.ok(report.logs[report.logs.length - 1]!.includes("campaign-finished"));

  // Default architecture set matches the methodology order.
  assert.deepEqual(BENCHMARK_ARCHITECTURES, ["agentless", "hierarchical", "consensus"]);
});

test("resumes an interrupted campaign, reusing stored artifacts (no re-run)", async () => {
  const { qodo } = loadSampleDatasets();
  const { importService, experimentService, storage } = buildBenchmarkPipeline();
  const manifestStore = new InMemoryManifestStore();

  const deps = {
    importService,
    experimentService,
    storage,
    manifestStore,
    clock: new FixedClock(),
  };

  const first = await new CampaignRunner(deps).run([qodo], CONFIG);
  assert.equal(first.summary.progress.completed, 6); // 2 instances × 3

  // Resume with the same store + storage: everything already complete.
  const resumed = await new CampaignRunner(deps).run([qodo], CONFIG);
  assert.equal(resumed.summary.progress.completed, 6);
  assert.equal(resumed.summary.progress.pending, 0);
  // Outcomes are reconstructed from storage so exports remain complete.
  assert.equal(resumed.outcomes.length, 6);
  assert.equal(resumed.exports.benchmarkCsv.split("\n").length, 7); // header + 6
});
