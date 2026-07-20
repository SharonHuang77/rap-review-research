/**
 * Phase 3 — RQ3 / H-complexity: does the topology effect grow with PR
 * complexity? ZERO LLM calls (replays qodo-all-{runs,cache}.json).
 *
 * DEVIATION FROM REGISTRATION (must be reported): the registered stratifier was
 * PR *type* (frontend-only / backend-only / database-only / cross-component).
 * That typing needs the PR diff, and `rawDiff` was not persisted on the
 * confirmatory runs (0/1188), so the registered variable is unavailable. We
 * substitute a ground-truth-derived complexity proxy — the number of distinct
 * files an instance's injected defects span ("GT breadth", the closest
 * available analogue of cross-component), with the defect count as a secondary
 * axis. Because the operationalization was not pre-specified, this analysis is
 * EXPLORATORY, not confirmatory.
 *
 * Per (PR, arch) it reuses the SAME evaluators as phase3-stats.ts
 * (GroundTruthEvaluator + CachedSemanticMatcher, 3 runs averaged), so per-arm
 * means reconcile with the headline table. For each registered arm contrast it
 * takes the per-PR paired difference d and tests the INTERACTION with
 * complexity two ways: (a) Spearman rank correlation of d vs complexity
 * (continuous; no arbitrary split), and (b) a median split into Low/High with
 * Cliff's delta between the strata's d distributions. Holm within the family.
 *
 * Env: PHASE2_OUT_DIR, RUNS_IN, CACHE_IN, SEMANTIC_THRESHOLD (=0.7),
 *      STATS_OUT (=<dir>/phase3-rq3-report.json).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { BenchmarkResult } from "../src/benchmark/models/benchmark-result.ts";
import { GroundTruthEvaluator } from "../src/benchmark/ground-truth-evaluator.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";
import {
  wilcoxonSignedRank,
  cliffsDelta,
  holmBonferroni,
  normalCdf,
  mean,
  median,
} from "../src/analysis/stats.ts";

const OUT_DIR = resolve(process.env.PHASE2_OUT_DIR ?? join(import.meta.dirname, "..", "phase2-results"));
const RUNS_IN = process.env.RUNS_IN ?? join(OUT_DIR, "qodo-all-runs.json");
const CACHE_IN = process.env.CACHE_IN ?? join(OUT_DIR, "qodo-all-cache.json");
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const STATS_OUT = process.env.STATS_OUT ?? join(OUT_DIR, "phase3-rq3-report.json");

const runs = JSON.parse(readFileSync(RUNS_IN, "utf8")) as BenchmarkRun[];
const cache = SemanticScoreCache.fromJSON(JSON.parse(readFileSync(CACHE_IN, "utf8")));
console.log(`loaded ${runs.length} runs, ${Object.keys(cache.toJSON()).length} cached pairs (tau=${TAU})`);

const semantic = new GroundTruthEvaluator({
  matcher: new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(cache), semanticThreshold: TAU }),
});

const ARCHS = ["agentless", "generalists-3", "hierarchical", "consensus"] as const;
type Arch = (typeof ARCHS)[number];

// --- per (arch, PR): average the 3 runs (same recipe as phase3-stats.ts) ------
const groups = new Map<string, BenchmarkResult[]>();
const complexity = new Map<string, { gtFiles: number; gtCount: number }>();
for (const r of runs) {
  const key = `${r.architecture} ${r.instanceId}`;
  (groups.get(key) ?? groups.set(key, []).get(key)!).push(semantic.evaluate(r));
  if (!complexity.has(r.instanceId)) {
    complexity.set(r.instanceId, {
      gtFiles: new Set(r.groundTruth.map((g) => g.file.trim().replace(/^\.\//, ""))).size,
      gtCount: r.groundTruth.length,
    });
  }
}

interface Cell { recall: number; f1: number }
const perPR = new Map<Arch, Map<string, Cell>>();
for (const a of ARCHS) perPR.set(a, new Map());
for (const [key, rs] of groups) {
  const idx = key.indexOf(" ");
  const arch = key.slice(0, idx) as Arch;
  const pr = key.slice(idx + 1);
  perPR.get(arch)!.set(pr, { recall: mean(rs.map((x) => x.recall)), f1: mean(rs.map((x) => x.f1)) });
}

const PRS = [...complexity.keys()].filter((pr) => ARCHS.every((a) => perPR.get(a)!.has(pr))).sort();
const cx = (pr: string): number => complexity.get(pr)!.gtFiles;
const cxs = PRS.map(cx);
const CX_MED = median(cxs);
console.log(`\nPRs: ${PRS.length} | complexity = distinct GT files/PR: min ${Math.min(...cxs)}, median ${CX_MED}, max ${Math.max(...cxs)}`);

// --- Spearman rho + normal-approx p ------------------------------------------
function rank(xs: readonly number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j += 1;
    const avg = (i + j) / 2 + 1; // average rank for ties
    for (let k = i; k <= j; k += 1) r[idx[k]![1]] = avg;
    i = j + 1;
  }
  return r;
}
function spearman(a: readonly number[], b: readonly number[]): { rho: number; p: number } {
  const ra = rank(a), rb = rank(b), n = a.length;
  const ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = ra[i]! - ma, y = rb[i]! - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const rho = da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
  const z = Math.abs(rho) * Math.sqrt(Math.max(1, n - 1));
  return { rho, p: 2 * (1 - normalCdf(z)) };
}

// --- contrasts: per-PR paired difference d = x - y ---------------------------
const CONTRASTS: Array<{ label: string; x: Arch; y: Arch; metric: "recall" | "f1"; hyp: string }> = [
  { label: "hierarchical - generalists-3", x: "hierarchical", y: "generalists-3", metric: "recall", hyp: "H-specialization" },
  { label: "consensus - hierarchical",     x: "consensus",    y: "hierarchical",   metric: "recall", hyp: "H-communication" },
  { label: "generalists-3 - agentless",    x: "generalists-3", y: "agentless",     metric: "recall", hyp: "H-compute" },
  { label: "agentless - hierarchical",     x: "agentless",    y: "hierarchical",   metric: "f1",     hyp: "F1 dominance" },
  { label: "agentless - consensus",        x: "agentless",    y: "consensus",      metric: "f1",     hyp: "F1 dominance" },
];

const rows = CONTRASTS.map((c) => {
  const d = PRS.map((pr) => perPR.get(c.x)!.get(pr)![c.metric] - perPR.get(c.y)!.get(pr)![c.metric]);
  const lowD: number[] = [], highD: number[] = [];
  PRS.forEach((pr, i) => (cx(pr) <= CX_MED ? lowD : highD).push(d[i]!));
  const sp = spearman(d, cxs);
  return {
    hypothesis: c.hyp, contrast: c.label, metric: c.metric, n: d.length,
    overallMedianD: median(d), overallP: wilcoxonSignedRank(d).p,
    lowN: lowD.length, lowMedianD: median(lowD), lowP: wilcoxonSignedRank(lowD).p,
    highN: highD.length, highMedianD: median(highD), highP: wilcoxonSignedRank(highD).p,
    interactionCliff: cliffsDelta(highD, lowD),   // >0 => effect larger on complex PRs
    spearmanRho: sp.rho, spearmanP: sp.p,
  };
});
const holm = holmBonferroni(rows.map((r) => r.spearmanP));
rows.forEach((r, i) => ((r as Record<string, unknown>).spearmanHolmP = holm[i]));

// --- report -------------------------------------------------------------------
const f = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : "n/a");
console.log(`\n=== RQ3: does the topology effect grow with PR complexity? ===`);
console.log(`complexity = distinct GT files; split at median ${CX_MED} (low n=${rows[0]!.lowN}, high n=${rows[0]!.highN})\n`);
console.log("hypothesis        contrast                      metric  d(low)  d(high)  Cliff  rho     Holm p");
for (const r of rows) {
  console.log(
    r.hypothesis.padEnd(18) + r.contrast.padEnd(30) + r.metric.padEnd(8) +
    f(r.lowMedianD).padStart(6) + "  " + f(r.highMedianD).padStart(7) + "  " +
    f(r.interactionCliff, 2).padStart(5) + "  " + f(r.spearmanRho, 2).padStart(5) + "  " +
    f((r as Record<string, number>).spearmanHolmP as number, 3).padStart(6),
  );
}

// per-arm means by stratum (context)
console.log(`\n=== per-arm semantic recall / F1 by complexity stratum ===`);
console.log("arch".padEnd(15) + "recall(low)  recall(high)   F1(low)  F1(high)");
const byStratum: Record<string, unknown>[] = [];
for (const a of ARCHS) {
  const lo = PRS.filter((pr) => cx(pr) <= CX_MED), hi = PRS.filter((pr) => cx(pr) > CX_MED);
  const row = {
    arch: a,
    recallLow: mean(lo.map((pr) => perPR.get(a)!.get(pr)!.recall)),
    recallHigh: mean(hi.map((pr) => perPR.get(a)!.get(pr)!.recall)),
    f1Low: mean(lo.map((pr) => perPR.get(a)!.get(pr)!.f1)),
    f1High: mean(hi.map((pr) => perPR.get(a)!.get(pr)!.f1)),
  };
  byStratum.push(row);
  console.log(a.padEnd(15) + f(row.recallLow).padStart(9) + f(row.recallHigh).padStart(13) + f(row.f1Low).padStart(10) + f(row.f1High).padStart(9));
}

writeFileSync(STATS_OUT, JSON.stringify({
  note: "EXPLORATORY: registered PR-type stratifier unavailable (rawDiff not persisted); complexity proxied by distinct GT files.",
  tau: TAU, nPRs: PRS.length, complexityMedian: CX_MED,
  complexityMeasure: "distinct ground-truth files per PR",
  contrasts: rows, perArmByStratum: byStratum,
}, null, 2));
console.log(`\nwrote ${STATS_OUT}`);
