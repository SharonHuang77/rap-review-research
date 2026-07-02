import { test } from "node:test";
import assert from "node:assert/strict";

import { Synthesizer } from "../../src/architectures/hierarchical/synthesizer.ts";
import type { SpecialistReviewResult } from "../../src/architectures/hierarchical/models/specialist-review-result.ts";
import type { AgentRole } from "../../src/architectures/hierarchical/messages.ts";
import type { ReviewFinding } from "../../src/models/finding.ts";
import { buildFinding } from "./support/stored-results.ts";

function specialist(
  role: AgentRole,
  findings: ReviewFinding[],
): SpecialistReviewResult {
  return {
    role,
    summary: `${role} summary`,
    findings,
    latencyMs: 10,
    inputTokens: 5,
    outputTokens: 3,
    estimatedCostUsd: 0.001,
  };
}

const synth = new Synthesizer();

test("merges distinct findings without removing any", () => {
  const result = synth.synthesize([
    specialist("backend", [buildFinding({ id: "b1", file: "a.ts", line: 1, title: "A" })]),
    specialist("database", [buildFinding({ id: "d1", file: "b.ts", line: 2, title: "B" })]),
  ]);
  assert.equal(result.mergedFindings.length, 2);
  assert.equal(result.duplicateCount, 0);
});

test("deduplicates findings sharing file+line+title", () => {
  const result = synth.synthesize([
    specialist("backend", [buildFinding({ id: "b1", file: "a.ts", line: 10, title: "Bug" })]),
    specialist("frontend", [buildFinding({ id: "f1", file: "a.ts", line: 10, title: "bug" })]),
  ]);
  assert.equal(result.mergedFindings.length, 1);
  assert.equal(result.duplicateCount, 1);
});

test("resolves severity conflicts by keeping the highest severity", () => {
  const result = synth.synthesize([
    specialist("backend", [
      buildFinding({ id: "b1", file: "a.ts", line: 10, title: "Bug", severity: "low", confidence: 0.9 }),
    ]),
    specialist("database", [
      buildFinding({ id: "d1", file: "a.ts", line: 10, title: "Bug", severity: "high", confidence: 0.3 }),
    ]),
  ]);
  assert.equal(result.mergedFindings.length, 1);
  assert.equal(result.mergedFindings[0]?.severity, "high");
});

test("breaks severity ties by highest confidence", () => {
  const result = synth.synthesize([
    specialist("backend", [
      buildFinding({ id: "b1", file: "a.ts", line: 10, title: "Bug", severity: "medium", confidence: 0.4 }),
    ]),
    specialist("database", [
      buildFinding({ id: "d1", file: "a.ts", line: 10, title: "Bug", severity: "medium", confidence: 0.8 }),
    ]),
  ]);
  assert.equal(result.mergedFindings[0]?.confidence, 0.8);
});

test("produces a deterministic summary and handles empty input", () => {
  const empty = synth.synthesize([]);
  assert.equal(empty.mergedFindings.length, 0);
  assert.equal(empty.duplicateCount, 0);
  assert.match(empty.managerSummary, /0 specialist/);

  const summary = synth.synthesize([specialist("backend", [buildFinding()])]).managerSummary;
  assert.match(summary, /1 specialist\(s\) \(backend\)/);
});
