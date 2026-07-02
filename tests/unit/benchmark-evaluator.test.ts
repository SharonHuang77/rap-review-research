import { test } from "node:test";
import assert from "node:assert/strict";

import type { ReviewFinding } from "../../src/models/finding.ts";
import type { BenchmarkRun, GroundTruthIssue } from "../../src/benchmark/index.ts";
import {
  GroundTruthEvaluator,
  BenchmarkEvaluator,
} from "../../src/benchmark/index.ts";

function finding(file: string, line: number): ReviewFinding {
  return {
    id: `${file}:${line}`,
    title: "issue",
    category: "correctness",
    severity: "high",
    file,
    line,
    description: "d",
    recommendation: "r",
    confidence: 0.8,
  };
}

function run(
  producedFindings: ReviewFinding[],
  groundTruth: GroundTruthIssue[],
): BenchmarkRun {
  return {
    runId: "r#agentless",
    datasetId: "ds",
    instanceId: "r",
    snapshotId: "snap",
    experimentId: "snap#agentless#m#v1#w1#e1",
    architecture: "agentless",
    producedFindings,
    groundTruth,
  };
}

const GT: GroundTruthIssue[] = [
  { id: "g1", file: "src/a.ts", lineStart: 10, lineEnd: 12 },
  { id: "g2", file: "src/b.ts", lineStart: 5, lineEnd: 5 },
];

test("computes precision, recall, F1, and localization accuracy", () => {
  // f1 hits g1 exactly; f2 hits g1's file but wrong line; f3 is off-file;
  // f4 hits g2's file but wrong line (detected, not localized).
  const findings = [
    finding("src/a.ts", 11), // TP for g1
    finding("src/a.ts", 50), // FP (file a.ts, no line overlap; g1 already taken)
    finding("src/c.ts", 1), // FP (unknown file)
    finding("src/b.ts", 99), // FP (file b.ts detected, no line overlap)
  ];
  const result = new GroundTruthEvaluator().evaluate(run(findings, GT));

  assert.equal(result.groundTruthCount, 2);
  assert.equal(result.producedCount, 4);
  assert.equal(result.truePositives, 1); // only f1↔g1
  assert.equal(result.falsePositives, 3);
  assert.equal(result.falseNegatives, 1); // g2 never localized

  assert.equal(round(result.precision), 0.25); // 1/4
  assert.equal(round(result.recall), 0.5); // 1/2
  assert.equal(round(result.f1), 0.3333); // 2PR/(P+R)
  // g1 and g2 both detected at file level (f1, f4); only g1 localized.
  assert.equal(round(result.localizationAccuracy), 0.5); // 1/2
});

test("perfect detection yields precision/recall/F1 = 1", () => {
  const findings = [finding("src/a.ts", 10), finding("src/b.ts", 5)];
  const result = new GroundTruthEvaluator().evaluate(run(findings, GT));
  assert.equal(result.truePositives, 2);
  assert.equal(result.falsePositives, 0);
  assert.equal(result.falseNegatives, 0);
  assert.equal(result.precision, 1);
  assert.equal(result.recall, 1);
  assert.equal(result.f1, 1);
  assert.equal(result.localizationAccuracy, 1);
});

test("no produced findings yields zero precision/recall and all false negatives", () => {
  const result = new GroundTruthEvaluator().evaluate(run([], GT));
  assert.equal(result.truePositives, 0);
  assert.equal(result.falseNegatives, 2);
  assert.equal(result.precision, 0);
  assert.equal(result.recall, 0);
  assert.equal(result.f1, 0);
  assert.equal(result.localizationAccuracy, 0);
});

test("a single finding cannot double-count against two issues", () => {
  // Two ground-truth issues in the same overlapping span; one finding.
  const overlapping: GroundTruthIssue[] = [
    { id: "g1", file: "src/a.ts", lineStart: 10, lineEnd: 12 },
    { id: "g2", file: "src/a.ts", lineStart: 10, lineEnd: 12 },
  ];
  const result = new GroundTruthEvaluator().evaluate(
    run([finding("src/a.ts", 11)], overlapping),
  );
  assert.equal(result.truePositives, 1); // greedy one-to-one
  assert.equal(result.falseNegatives, 1);
});

test("BenchmarkEvaluator macro-summarizes results per architecture", () => {
  const evaluator = new BenchmarkEvaluator();
  const results = [
    { ...new GroundTruthEvaluator().evaluate(run([finding("src/a.ts", 10)], GT)) },
    {
      ...new GroundTruthEvaluator().evaluate({
        ...run([finding("src/a.ts", 10), finding("src/b.ts", 5)], GT),
        architecture: "hierarchical",
      }),
    },
  ];
  const summary = evaluator.summarizeByArchitecture(results);
  assert.deepEqual(
    summary.map((s) => s.architecture),
    ["agentless", "hierarchical"],
  );
  const hier = summary.find((s) => s.architecture === "hierarchical")!;
  assert.equal(hier.instanceCount, 1);
  assert.equal(hier.meanRecall, 1);
});

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
