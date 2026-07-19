import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeGenuineByDepth } from "../../src/industrial/agreement-depth.ts";
import { FindingPairScoreCache } from "../../src/benchmark/matching/finding-pair-judge.ts";
import type { ReviewFinding } from "../../src/models/finding.ts";

const f = (id: string, file: string, line: number, title: string): ReviewFinding => ({
  id, title, category: "correctness", severity: "medium", file, line,
  description: title, recommendation: "fix", confidence: 0.7,
});

test("buckets cross-family clusters by family-agreement depth and reports genuine rate", () => {
  const a = f("a", "x.ts", 10, "null deref");   // haiku
  const b = f("b", "x.ts", 10, "null deref");   // kimi — same issue as a (depth 2)
  const c = f("c", "y.ts", 5, "typo");          // glm — lone (depth 1)
  const cache = new FindingPairScoreCache();
  cache.set(a, b, 0.9);                          // a≈b per the pair judge
  const familyFindings = new Map<string, ReviewFinding[]>([
    ["haiku", [a]], ["kimi", [b]], ["glm", [c]],
  ]);
  const verdicts = { a: "valid", b: "valid", c: "invalid" } as const;
  const table = judgeGenuineByDepth(familyFindings, verdicts, cache);
  const d2 = table.find((r) => r.depth === 2)!;
  const d1 = table.find((r) => r.depth === 1)!;
  assert.equal(d2.genuine, 1); assert.equal(d2.total, 1); // depth-2 cluster genuine (rep a=valid)
  assert.equal(d1.genuine, 0); assert.equal(d1.total, 1); // depth-1 cluster not genuine
});
