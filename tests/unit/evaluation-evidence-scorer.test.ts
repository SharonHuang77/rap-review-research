import { test } from "node:test";
import assert from "node:assert/strict";

import { HeuristicEvidenceScorer } from "../../src/evaluation/scorers/heuristic-evidence-scorer.ts";
import { buildStoredResult, buildFinding } from "./support/stored-results.ts";

const scorer = new HeuristicEvidenceScorer();

test("scores zero when there are no findings", () => {
  const m = scorer.calculate(buildStoredResult({ findings: [] }));
  assert.equal(m.evidenceScore, 0);
});

test("computes a deterministic heuristic score in [0,1]", () => {
  // one high-severity (0.75) finding, confidence 0.8, volume 1/5 = 0.2
  // 0.4*0.75 + 0.4*0.8 + 0.2*0.2 = 0.66
  const m = scorer.calculate(
    buildStoredResult({ findings: [buildFinding({ severity: "high", confidence: 0.8 })] }),
  );
  assert.ok(Math.abs(m.evidenceScore - 0.66) < 1e-9);
  assert.ok(m.evidenceScore >= 0 && m.evidenceScore <= 1);
});

test("higher severity and confidence yield a higher score", () => {
  const low = scorer.calculate(
    buildStoredResult({ findings: [buildFinding({ severity: "low", confidence: 0.2 })] }),
  ).evidenceScore;
  const high = scorer.calculate(
    buildStoredResult({ findings: [buildFinding({ severity: "critical", confidence: 0.95 })] }),
  ).evidenceScore;
  assert.ok(high > low);
});

test("leaves future evidence signals undefined", () => {
  const m = scorer.calculate(buildStoredResult());
  assert.equal(m.architectureAgreement, undefined);
  assert.equal(m.acceptedFindingRate, undefined);
  assert.equal(m.laterFixRate, undefined);
});

test("is deterministic across repeated calls", () => {
  const result = buildStoredResult();
  assert.equal(scorer.calculate(result).evidenceScore, scorer.calculate(result).evidenceScore);
});
