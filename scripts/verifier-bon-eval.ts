/**
 * Verifier-Filtered Best-of-N (VF-BoN) — V0/V1 replay evaluation (doc 08).
 *
 * EXPLORATORY follow-up, not part of the registered confirmatory analysis.
 * Pure eval-side replay over persisted repeated-run generations: pools the
 * findings of the N agentless runs per instance into a best-of-N candidate set,
 * then applies zero-cost verifiers:
 *
 *   baseline  agentless(1): macro over the individual single runs
 *   V0        raw union of N runs (recall ceiling / precision floor)
 *   V1 (k)    self-consistency: keep findings recurring in >= k distinct runs
 *
 * No LLM calls: generation is replayed from RUNS_IN and semantic matching from
 * the persisted judge cache (CACHE_IN) — findings are unmodified copies, so
 * cached (finding x GT) pair scores apply verbatim. The multi-agent arms from
 * the same batch are re-evaluated for an identical-data overlay.
 *
 * Run:  RUNS_IN=<runs.json> CACHE_IN=<cache.json> npm run bon:eval
 * Env:  SEMANTIC_THRESHOLD (=0.7), BON_OUT (optional JSON report path)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { BenchmarkResult } from "../src/benchmark/models/benchmark-result.ts";
import { GroundTruthEvaluator } from "../src/benchmark/ground-truth-evaluator.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";
import {
  areDuplicateFindings,
  dedupeFindings,
} from "../src/architectures/shared/finding-dedup.ts";

const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);

const runsIn = process.env.RUNS_IN;
const cacheIn = process.env.CACHE_IN;
if (!runsIn || !existsSync(runsIn)) {
  console.error("Set RUNS_IN to a persisted runs JSON (repeated runs, RUNS_PER_INSTANCE >= 2).");
  process.exit(1);
}
if (!cacheIn || !existsSync(cacheIn)) {
  console.error("Set CACHE_IN to the matching persisted judge cache JSON.");
  process.exit(1);
}

const runs = JSON.parse(readFileSync(runsIn, "utf8")) as BenchmarkRun[];
const cache = SemanticScoreCache.fromJSON(JSON.parse(readFileSync(cacheIn, "utf8")));

// --- pool agentless findings per instance, tracking cross-run multiplicity ----
type Finding = BenchmarkRun["producedFindings"][number];
interface Cluster {
  readonly rep: Finding;
  readonly runsWith: Set<number>;
}

// Pool per architecture: every arm's repeated runs are a best-of-N candidate
// pool. The multi-agent arms are where the verifier has headroom — they carry
// the recall (diverse findings) and the precision problem V1 exists to fix.
const ARCHES = [...new Set(runs.map((r) => r.architecture))];
function groupByInstance(archRuns: BenchmarkRun[]): Map<string, BenchmarkRun[]> {
  const byInstance = new Map<string, BenchmarkRun[]>();
  for (const r of archRuns) {
    byInstance.set(r.instanceId, [...(byInstance.get(r.instanceId) ?? []), r]);
  }
  return byInstance;
}
console.log(`VF-BoN replay — ${runsIn}\narchitectures: ${ARCHES.join(", ")}; ${runs.length} runs total`);

// Pooled variants per instance. Within-run A4 dedup first so a run's internal
// near-duplicates cannot inflate cross-run multiplicity; clustering then mirrors
// dedupeFindings semantics (first kept representative is the cluster anchor).
function clusterInstance(instanceRuns: BenchmarkRun[]): Cluster[] {
  const clusters: Cluster[] = [];
  instanceRuns.forEach((run, runIdx) => {
    for (const finding of dedupeFindings(run.producedFindings)) {
      const hit = clusters.find((c) => areDuplicateFindings(c.rep, finding));
      if (hit) {
        hit.runsWith.add(runIdx);
      } else {
        clusters.push({ rep: finding, runsWith: new Set([runIdx]) });
      }
    }
  });
  return clusters;
}

function pooledRun(template: BenchmarkRun, label: string, findings: Finding[]): BenchmarkRun {
  return { ...template, runId: `${template.instanceId}#bon#${label}`, producedFindings: findings };
}

const variants = new Map<string, BenchmarkRun[]>(); // label -> one pooled run per instance
for (const arch of ARCHES) {
  const byInstance = groupByInstance(runs.filter((r) => r.architecture === arch));
  const maxN = Math.max(...[...byInstance.values()].map((l) => l.length));
  for (const instanceRuns of byInstance.values()) {
    const clusters = clusterInstance(instanceRuns);
    const template = instanceRuns[0]!;
    const add = (label: string, minRuns: number): void => {
      const kept = clusters.filter((c) => c.runsWith.size >= minRuns).map((c) => c.rep);
      variants.set(label, [...(variants.get(label) ?? []), pooledRun(template, label, kept)]);
    };
    add(`${arch} V0`, 1);
    for (let k = 2; k <= maxN; k += 1) add(`${arch} V1 k=${k}`, k);
  }
}

// --- evaluate: strict vs semantic, identical wiring to benchmark-judge-eval ---
const strict = new GroundTruthEvaluator();
const semantic = new GroundTruthEvaluator({
  matcher: new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(cache), semanticThreshold: TAU }),
});

function macro(results: BenchmarkResult[]): { p: number; r: number; f1: number } {
  const n = results.length || 1;
  return {
    p: results.reduce((a, x) => a + x.precision, 0) / n,
    r: results.reduce((a, x) => a + x.recall, 0) / n,
    f1: results.reduce((a, x) => a + x.f1, 0) / n,
  };
}

interface Row {
  readonly label: string;
  readonly n: number;
  readonly avgFindings: number;
  readonly strict: { p: number; r: number; f1: number };
  readonly semantic: { p: number; r: number; f1: number };
}

function evaluateRow(label: string, rowRuns: BenchmarkRun[]): Row {
  return {
    label,
    n: rowRuns.length,
    avgFindings: rowRuns.reduce((a, r) => a + r.producedFindings.length, 0) / (rowRuns.length || 1),
    strict: macro(rowRuns.map((r) => strict.evaluate(r))),
    semantic: macro(rowRuns.map((r) => semantic.evaluate(r))),
  };
}

const rows: Row[] = [];
for (const arch of ARCHES) {
  rows.push(evaluateRow(`${arch} single mean`, runs.filter((r) => r.architecture === arch)));
  for (const [label, pooled] of variants) {
    if (label.startsWith(`${arch} `)) rows.push(evaluateRow(`  ${label}`, pooled));
  }
}

console.log(`\n=== VF-BoN V0/V1 vs the ladder — strict (file+line) vs semantic (judge τ=${TAU}) ===`);
console.log(
  "variant".padEnd(22) + "  n    findings/run   P(s)→P(sem)   R(s)→R(sem)   F1(s)→F1(sem)",
);
for (const row of rows) {
  console.log(
    row.label.padEnd(22) +
      `  ${String(row.n).padEnd(3)}  ${row.avgFindings.toFixed(1).padStart(6)}        ` +
      `${row.strict.p.toFixed(2)}→${row.semantic.p.toFixed(2)}     ` +
      `${row.strict.r.toFixed(2)}→${row.semantic.r.toFixed(2)}     ` +
      `${row.strict.f1.toFixed(2)}→${row.semantic.f1.toFixed(2)}`,
  );
}
console.log(
  "\nExploratory replay (doc 08): NOT part of the registered confirmatory analysis.\n" +
    "V1 k=N requires a finding to recur in every run — the strictest zero-cost verifier.",
);

if (process.env.BON_OUT) {
  writeFileSync(process.env.BON_OUT, JSON.stringify({ tau: TAU, runsIn, rows }, null, 2));
  console.log(`report → ${process.env.BON_OUT}`);
}
