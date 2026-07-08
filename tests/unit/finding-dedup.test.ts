import { test } from "node:test";
import assert from "node:assert/strict";

import type { ReviewFinding } from "../../src/models/finding.ts";
import { areDuplicateFindings } from "../../src/architectures/shared/finding-dedup.ts";

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: "f",
    title: "SQL injection in query",
    category: "security",
    severity: "high",
    file: "src/db.ts",
    line: 42,
    description: "d",
    recommendation: "r",
    confidence: 0.8,
    ...overrides,
  };
}

test("identical findings are duplicates (backward compatible)", () => {
  assert.equal(areDuplicateFindings(finding(), finding()), true);
});

test("paraphrased titles on a nearby line merge", () => {
  const a = finding({ title: "SQL injection in query", line: 42 });
  const b = finding({
    title: "SQL injection vulnerability in query builder",
    line: 43,
  });
  assert.equal(areDuplicateFindings(a, b), true);
});

test("distinct issues on the same line do NOT merge", () => {
  const a = finding({ title: "SQL injection in query", line: 42 });
  const b = finding({ title: "Missing rate limiting on endpoint", line: 42 });
  assert.equal(areDuplicateFindings(a, b), false);
});

test("same title in a different file does NOT merge", () => {
  const a = finding({ file: "src/db.ts" });
  const b = finding({ file: "src/api.ts" });
  assert.equal(areDuplicateFindings(a, b), false);
});

test("same issue far apart in the file does NOT merge by default", () => {
  const a = finding({ line: 42 });
  const b = finding({ line: 400 });
  assert.equal(areDuplicateFindings(a, b), false);
});

test("leading ./ in the path is normalized", () => {
  const a = finding({ file: "./src/db.ts" });
  const b = finding({ file: "src/db.ts" });
  assert.equal(areDuplicateFindings(a, b), true);
});

test("line proximity and title similarity are configurable", () => {
  const a = finding({ line: 42 });
  const b = finding({ line: 60 });
  assert.equal(areDuplicateFindings(a, b, { lineProximity: 20 }), true);

  const c = finding({ title: "auth bug" });
  const d = finding({ title: "authentication defect" });
  // Low token overlap by default → not duplicates; relax the threshold.
  assert.equal(areDuplicateFindings(c, d), false);
  assert.equal(areDuplicateFindings(c, d, { titleSimilarity: 0 }), true);
});
