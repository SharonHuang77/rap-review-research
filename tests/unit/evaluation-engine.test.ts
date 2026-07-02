import { test } from "node:test";
import assert from "node:assert/strict";

import { EvaluationEngine } from "../../src/evaluation/evaluation-engine.ts";
import { EvaluationError } from "../../src/evaluation/evaluation-errors.ts";
import { toEvaluationExportRow } from "../../src/evaluation/models/evaluation-export-row.ts";
import { buildStoredResult, buildFinding } from "./support/stored-results.ts";

const engine = new EvaluationEngine();

test("evaluate produces metrics with all three categories", () => {
  const m = engine.evaluate(
    buildStoredResult({ architecture: "agentless", findings: [buildFinding()] }),
  );
  assert.equal(m.architecture, "agentless");
  assert.equal(m.reviewQuality.findingCount, 1);
  assert.equal(m.operationalCost.estimatedCostUsd, 0.01);
  assert.ok(m.researchEvidence.evidenceScore > 0);
});

test("evaluate throws when the validated result is missing", () => {
  assert.throws(
    () => engine.evaluate(buildStoredResult({ validated: false })),
    EvaluationError,
  );
});

test("evaluateBatch groups architectures reviewing the same snapshot", () => {
  const agentless = buildStoredResult({
    experimentId: "snap_1#agentless#m#v1#w1#e1",
    architecture: "agentless",
  });
  const consensus = buildStoredResult({
    experimentId: "snap_1#consensus#m#v1#w1#e1",
    architecture: "consensus",
  });
  const other = buildStoredResult({
    experimentId: "snap_2#agentless#m#v1#w1#e1",
    architecture: "agentless",
  });

  const comparisons = engine.evaluateBatch([agentless, consensus, other]);

  assert.equal(comparisons.length, 2); // two snapshots
  const snap1 = comparisons.find((c) => c.experimentId === "snap_1");
  assert.equal(snap1?.architectures.length, 2);
  assert.deepEqual(
    snap1?.architectures.map((a) => a.architecture),
    ["agentless", "consensus"], // sorted
  );
  const snap2 = comparisons.find((c) => c.experimentId === "snap_2");
  assert.equal(snap2?.architectures.length, 1);
});

test("evaluateBatch reuses evaluate (same metrics as single evaluation)", () => {
  const result = buildStoredResult({ experimentId: "snap_x#agentless#m#v1#w1#e1" });
  const single = engine.evaluate(result);
  const batch = engine.evaluateBatch([result]);
  assert.deepEqual(batch[0]?.architectures[0], single);
});

test("toEvaluationExportRow flattens metrics into one row", () => {
  const m = engine.evaluate(
    buildStoredResult({
      architecture: "agentless",
      findings: [buildFinding({ severity: "critical", confidence: 0.9 })],
      latencyMs: 800,
      inputTokens: 400,
      outputTokens: 60,
      estimatedCostUsd: 0.02,
    }),
  );
  const row = toEvaluationExportRow(m);
  assert.equal(row.experimentId, m.experimentId);
  assert.equal(row.architecture, "agentless");
  assert.equal(row.findingCount, 1);
  assert.equal(row.criticalSeverityCount, 1);
  assert.equal(row.highSeverityCount, 0);
  assert.equal(row.estimatedCostUsd, 0.02);
  assert.equal(row.evidenceScore, m.researchEvidence.evidenceScore);
});
