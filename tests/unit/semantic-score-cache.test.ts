import { test } from "node:test";
import assert from "node:assert/strict";

import type { ReviewFinding } from "../../src/models/finding.ts";
import type { GroundTruthIssue } from "../../src/benchmark/index.ts";
import { SemanticScoreCache, pairKey } from "../../src/benchmark/matching/semantic-score-cache.ts";

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return { id: "f", title: "t", category: "correctness", severity: "high", file: "a.ts", line: 11, description: "d", recommendation: "r", confidence: 0.8, ...overrides };
}
function issue(overrides: Partial<GroundTruthIssue> = {}): GroundTruthIssue {
  return { id: "g", file: "a.ts", lineStart: 10, lineEnd: 12, ...overrides };
}

test("get returns undefined before set, the score after", () => {
  const c = new SemanticScoreCache();
  assert.equal(c.get(finding(), issue()), undefined);
  assert.equal(c.has(finding(), issue()), false);
  c.set(finding(), issue(), 0.9);
  assert.equal(c.get(finding(), issue()), 0.9);
  assert.equal(c.has(finding(), issue()), true);
});

test("different pairs get different keys", () => {
  assert.notEqual(pairKey(finding(), issue()), pairKey(finding({ line: 50 }), issue()));
});

test("toJSON/fromJSON round-trips", () => {
  const c = new SemanticScoreCache();
  c.set(finding(), issue(), 0.5);
  const restored = SemanticScoreCache.fromJSON(c.toJSON());
  assert.equal(restored.get(finding(), issue()), 0.5);
});
