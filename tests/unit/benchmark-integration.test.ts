import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BenchmarkImporter,
  BenchmarkRunner,
  BenchmarkEvaluator,
  BenchmarkCsvExporter,
  BENCHMARK_STABLE_COLUMNS,
} from "../../src/benchmark/index.ts";
import type { BenchmarkRun } from "../../src/benchmark/index.ts";
import {
  EXECUTION_CONFIG,
  buildBenchmarkPipeline,
  loadSampleDatasets,
} from "../../scripts/benchmark-shared.ts";

// full pipeline: fixtures → adapters → import → run (3 architectures) →
// ground-truth evaluation → benchmark CSV. Mock provider; no Bedrock.
test("evaluates a small benchmark subset across all three architectures", async () => {
  const { qodo, swe } = loadSampleDatasets();
  const { importService, experimentService, storage } = buildBenchmarkPipeline();

  const importer = new BenchmarkImporter(importService);
  const qodoImported = await importer.import(qodo);
  const sweImported = await importer.import(swe);

  // DoD: both fixtures import successfully.
  assert.equal(qodoImported.length, 2);
  assert.equal(sweImported.length, 1);
  assert.ok(qodoImported[0]!.snapshotId);
  assert.ok(sweImported[0]!.snapshotId);

  const runner = new BenchmarkRunner({
    experimentService,
    storage,
    config: EXECUTION_CONFIG,
  });
  const runs: BenchmarkRun[] = [
    ...(await runner.run(qodo, qodoImported)),
    ...(await runner.run(swe, sweImported)),
  ];

  // 3 instances × 3 architectures.
  assert.equal(runs.length, 9);

  // Comparison preserved: each instance reviewed by all three architectures.
  for (const instanceId of ["qodo-1", "qodo-2", "swe-1"]) {
    const archs = runs
      .filter((r) => r.instanceId === instanceId)
      .map((r) => r.architecture)
      .sort();
    assert.deepEqual(archs, ["agentless", "consensus", "hierarchical"]);
  }

  const results = new BenchmarkEvaluator().evaluateRuns(runs);
  assert.equal(results.length, 9);
  for (const r of results) {
    assert.ok(r.precision >= 0 && r.precision <= 1);
    assert.ok(r.recall >= 0 && r.recall <= 1);
    assert.ok(r.f1 >= 0 && r.f1 <= 1);
    assert.ok(r.localizationAccuracy >= 0 && r.localizationAccuracy <= 1);
  }

  // The mock produces a finding at src/api/users.ts:11, matching qodo-1's
  // ground truth — so qodo-1 has real detections for every architecture.
  const qodo1 = results.filter((r) => r.instanceId === "qodo-1");
  assert.ok(qodo1.every((r) => r.truePositives >= 1));

  // DoD: benchmark CSV generated with the stable header and one row per run.
  const csv = new BenchmarkCsvExporter().export(results, "2026-07-02T12:00:00.000Z");
  const lines = csv.content.split("\n");
  assert.equal(lines[0], BENCHMARK_STABLE_COLUMNS.join(","));
  assert.equal(csv.rowCount, 9);
  assert.ok(csv.content.includes("agentless"));
  assert.ok(csv.content.includes("hierarchical"));
  assert.ok(csv.content.includes("consensus"));
});
