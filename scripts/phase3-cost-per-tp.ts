/**
 * Phase 3 — Cost/TP: LLM calls per golden-confirmed finding, pooled over the
 * registered 80-PR hetero test set. ZERO LLM calls (replays persisted runs +
 * judge cache). Reproduces the Cost/TP column of the E1 table.
 *
 * COUNTING CONVENTION (differs from the rest of the paper, and that is the point
 * of this file existing): the denominator is the number of *findings* that match
 * some golden defect, duplicates included — not the one-to-one bipartite
 * truePositives used for precision/recall/F1. An arm that reports the same defect
 * three times is credited three times here. That is the generous reading for the
 * multi-agent arms: under the bipartite convention the same data gives 0.39 /
 * 0.94 / 0.93 / 3.36, i.e. an 8.6x Consensus premium rather than 5.2x.
 *
 * Env: RUNS_IN, CACHE_IN, HETERO_REPORT, SEMANTIC_THRESHOLD (=0.7).
 * Run: node scripts/phase3-cost-per-tp.ts
 */
import { readFileSync } from "node:fs";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";

const RUNS_IN = process.env.RUNS_IN ?? "phase2-results/qodo-all-runs.json";
const CACHE_IN = process.env.CACHE_IN ?? "phase2-results/qodo-all-cache.json";
const HETERO = process.env.HETERO_REPORT ?? "hetero-confirmatory/phase3-hetero-stats-report.json";
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);

/** Nominal LLM calls per run, per the ladder (Hierarchical's coordinator and synthesiser are code). */
const CALLS: Record<string, number> = { agentless: 1, "generalists-3": 3, hierarchical: 3, consensus: 9 };

const runs = JSON.parse(readFileSync(RUNS_IN, "utf8")) as BenchmarkRun[];
const cache = SemanticScoreCache.fromJSON(JSON.parse(readFileSync(CACHE_IN, "utf8")) as Record<string, number>);
const testSet = new Set(
  (JSON.parse(readFileSync(HETERO, "utf8")) as { testSet: { instances: string[] } }).testSet.instances,
);
const matcher = new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(cache), semanticThreshold: TAU });

const acc: Record<string, { confirmed: number; runs: number }> = {};
for (const run of runs) {
  if (!testSet.has(run.instanceId)) continue;
  const arm = run.architecture;
  if (!(arm in CALLS)) continue;
  acc[arm] ??= { confirmed: 0, runs: 0 };
  const groundTruth = run.groundTruth ?? [];
  for (const finding of run.producedFindings ?? []) {
    if (groundTruth.some((issue) => matcher.match(finding, issue).matched)) acc[arm]!.confirmed += 1;
  }
  acc[arm]!.runs += 1;
}

console.log(`Cost/TP — ${testSet.size}-PR pooled, semantic matching (tau=${TAU}), zero LLM\n`);
console.log("arm            calls/run  runs  confirmed  Cost/TP");
for (const arm of Object.keys(CALLS)) {
  const a = acc[arm];
  if (!a) continue;
  const totalCalls = CALLS[arm]! * a.runs;
  console.log(
    `${arm.padEnd(14)} ${String(CALLS[arm]).padEnd(10)} ${String(a.runs).padEnd(5)} ` +
      `${String(a.confirmed).padEnd(10)} ${(totalCalls / a.confirmed).toFixed(2)}`,
  );
}
