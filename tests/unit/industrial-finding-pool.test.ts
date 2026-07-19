import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPool, poolCoverage } from "../../src/industrial/finding-pool.ts";
import { FindingPairScoreCache } from "../../src/benchmark/matching/finding-pair-judge.ts";
import type { ReviewFinding } from "../../src/models/finding.ts";

const f = (id: string, file: string, line: number, title: string): ReviewFinding => ({
  id, title, category: "correctness", severity: "medium", file, line,
  description: title, recommendation: "fix", confidence: 0.7,
});

// Seed a pair cache so clustering is deterministic and zero-LLM.
const cacheOf = (pairs: [ReviewFinding, ReviewFinding, number][]): FindingPairScoreCache => {
  const c = new FindingPairScoreCache();
  for (const [a, b, s] of pairs) c.set(a, b, s);
  return c;
};

test("a finding seen by >=2 sources enters the pool; a lone finding does not", () => {
  const a = f("a", "src/x.ts", 10, "null deref");
  const c = f("c", "src/x.ts", 10, "null dereference"); // pair judge says a≈c
  const d = f("d", "src/z.ts", 99, "unused var");       // lone → excluded
  const sources = new Map<string, ReviewFinding[]>([
    ["haiku", [a]], ["kimi", [c]], ["glm", [d]],
  ]);
  const pool = buildPool(sources, cacheOf([[a, c, 0.9]]), { minSources: 2 });
  assert.equal(pool.length, 1);
  assert.deepEqual([...pool[0]!.sources].sort(), ["haiku", "kimi"]);
});

test("poolCoverage = fraction of clusters an arm's findings match", () => {
  const a = f("a", "src/x.ts", 10, "null deref");
  const c = f("c", "src/x.ts", 10, "null deref");
  const e = f("e", "src/y.ts", 5, "race condition");
  const g = f("g", "src/y.ts", 5, "race condition");
  const h = f("h", "src/x.ts", 10, "possible null deref"); // arm finding, matches cluster 1 only
  const sources = new Map<string, ReviewFinding[]>([
    ["haiku", [a]], ["kimi", [c]], ["glm", [e]], ["static", [g]],
  ]);
  const cache = cacheOf([[a, c, 0.9], [e, g, 0.9], [h, a, 0.8]]);
  const pool = buildPool(sources, cache, { minSources: 2 }); // 2 clusters
  assert.equal(poolCoverage([h], pool, cache), 0.5);
});

test("leave-one-out rebuilds the pool without the excluded source", () => {
  const a = f("a", "src/x.ts", 10, "null deref");
  const c = f("c", "src/x.ts", 10, "null deref");
  const sources = new Map<string, ReviewFinding[]>([["haiku", [a]], ["kimi", [c]]]);
  // Excluding kimi leaves haiku's finding with only 1 source → no >=2 clusters.
  const pool = buildPool(sources, cacheOf([[a, c, 0.9]]), { minSources: 2, excludeSource: "kimi" });
  assert.equal(pool.length, 0);
});
