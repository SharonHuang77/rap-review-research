/**
 * Conditioned-sequential × cross-family filter analysis (doc-17 §7 follow-up).
 *
 * The conditioned-sequential arm buys the highest single-model coverage of any
 * method (K=3 union: R≈67%) by telling each pass to find issues EARLIER passes
 * missed — but precision collapses to ≈23% (the "find new" fabrication mode).
 * doc-17 §7 leaves one question open: does the paper's precision instrument, a
 * cross-family agreement filter, RECLAIM that precision on the 67% coverage base,
 * or is the coverage conditioning buys exactly the coverage a corroboration
 * filter discards (rare-to-Haiku ⇒ rare-to-everyone)?
 *
 * This re-analyses the ALREADY-GENERATED conditioned union findings: for each
 * conditioned finding we count how many OTHER families (Kimi, GLM, DeepSeek,
 * Nova, Llama4, Palmyra — never Haiku, the base's own family) independently flag
 * a structural duplicate, then keep findings corroborated by >= m families. Every
 * kept finding is a subset of the conditioned union, so its judge score is already
 * in conditioned-cache.json: ZERO new LLM calls. Evaluation reuses the exact
 * GroundTruthEvaluator + CachedSemanticMatcher wiring from conditioned-eval.ts, so
 * the "raw union" row reproduces the doc-17 §7 macro numbers (R67 P23 F1 .33) and
 * every filtered row is directly comparable. EXPLORATORY.
 *
 * MATCHED CONTROL: the identical filter (same pool, same union-based corroboration,
 * same instances) is applied to an INDEPENDENT Haiku K=3 union (ladder-haiku07) so
 * the two bases differ ONLY in how coverage was obtained — explicit "find-new"
 * conditioning vs implicit temperature diversity. The head-to-head at a fixed
 * corroboration threshold answers whether conditioning's extra coverage survives a
 * corroboration filter (real rare issues) or is discarded with it (rare-to-Haiku ⇒
 * rare-to-everyone), controlling for corroboration richness — which the doc-17
 * temp-filter row (single-draw families, different instances) could not.
 *
 * Env: COND_RUNS (=module-arm/conditioned-union-runs.json),
 *      COND_CACHE (=module-arm/conditioned-cache.json),
 *      INDEP_RUNS (=hetero-confirmatory/ladder-haiku07-runs.json),
 *      INDEP_CACHE (=hetero-confirmatory/ladder-haiku07-cache.json),
 *      FAMILY_RUNS (=comma list of run json; default the 6 non-Haiku families),
 *      SEMANTIC_THRESHOLD (=0.7).
 * Run: node scripts/conditioned-filter-analysis.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { GroundTruthEvaluator } from "../src/benchmark/ground-truth-evaluator.ts";
import { areDuplicateFindings } from "../src/architectures/shared/finding-dedup.ts";

const rr = join(import.meta.dirname, "..");
const COND_RUNS = resolve(process.env.COND_RUNS ?? join(rr, "module-arm", "conditioned-union-runs.json"));
const COND_CACHE = resolve(process.env.COND_CACHE ?? join(rr, "module-arm", "conditioned-cache.json"));
const INDEP_RUNS = resolve(process.env.INDEP_RUNS ?? join(rr, "hetero-confirmatory", "ladder-haiku07-runs.json"));
const INDEP_CACHE = resolve(process.env.INDEP_CACHE ?? join(rr, "hetero-confirmatory", "ladder-haiku07-cache.json"));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const FAMILY_SPEC = process.env.FAMILY_RUNS ??
  [
    `kimi:${join(rr, "hetero-confirmatory", "hetero-runs-moonshotai.kimi-k2.5.json")}`,
    `glm:${join(rr, "hetero-confirmatory", "hetero-runs-zai.glm-5.json")}`,
    `deepseek:${join(rr, "hetero-confirmatory", "ladder-deepseek-runs.json")}`,
    `nova:${join(rr, "hetero-confirmatory", "ladder-nova-runs.json")}`,
    `llama4:${join(rr, "hetero-confirmatory", "ladder-llama4-runs.json")}`,
    `palmyra:${join(rr, "hetero-confirmatory", "ladder-palmyra-runs.json")}`,
  ].join(",");

function load<T>(p: string): T {
  if (!existsSync(p)) { console.error(`missing: ${p}`); process.exit(1); }
  return JSON.parse(readFileSync(p, "utf8")) as T;
}
const dedup = (fs: ReviewFinding[]): ReviewFinding[] => {
  const o: ReviewFinding[] = [];
  for (const f of fs) if (!o.some((k) => areDuplicateFindings(k, f))) o.push(f);
  return o;
};
/** Per-instance union of a family's findings across all its runs (its full reachable set). */
function familyUnion(runs: BenchmarkRun[]): Map<string, ReviewFinding[]> {
  const g = new Map<string, ReviewFinding[]>();
  for (const r of runs) if (r.architecture === "agentless") g.set(r.instanceId, [...(g.get(r.instanceId) ?? []), ...r.producedFindings]);
  const m = new Map<string, ReviewFinding[]>();
  for (const [i, fs] of g) m.set(i, dedup(fs));
  return m;
}

interface Base { label: string; byInst: Map<string, BenchmarkRun>; cache: SemanticScoreCache }
/** One BenchmarkRun per instance whose producedFindings are the K=3 union of that base's runs. */
function buildBase(label: string, runsPath: string, cachePath: string): Base {
  const raw = load<BenchmarkRun[]>(runsPath).filter((r) => r.architecture === "agentless");
  const union = familyUnion(raw); // per-instance dedup union of all K runs
  const byInst = new Map<string, BenchmarkRun>();
  for (const r of raw) if (!byInst.has(r.instanceId)) byInst.set(r.instanceId, { ...r, producedFindings: union.get(r.instanceId) ?? [] });
  return { label, byInst, cache: SemanticScoreCache.fromJSON(load<Record<string, number>>(cachePath)) };
}
const conditioned = buildBase("conditioned (find-new)", COND_RUNS, COND_CACHE);
const independent = buildBase("independent (temp K=3)", INDEP_RUNS, INDEP_CACHE);
const families = FAMILY_SPEC.split(",").map((s) => s.trim()).filter(Boolean).map((spec) => {
  const i = spec.indexOf(":"); const name = spec.slice(0, i); const p = spec.slice(i + 1);
  return { name, byInst: familyUnion(load<BenchmarkRun[]>(resolve(p))) };
});
const kimiGlm = families.filter((f) => f.name === "kimi" || f.name === "glm");

// common instance set: present in BOTH bases and EVERY family (so both bases are scored on identical PRs)
let insts = [...conditioned.byInst.keys()].filter((i) => independent.byInst.has(i));
for (const fam of families) insts = insts.filter((i) => fam.byInst.has(i));
console.log(`Conditioned × cross-family filter — ${insts.length} Qodo PRs (common to both bases + all families).`);
console.log(`Corroboration pool: ${families.map((f) => f.name).join(", ")} (union of each family's runs; semantic τ=${TAU}).\n`);

/** How many distinct pool families structurally corroborate a finding on this instance. */
function corroborators(f: ReviewFinding, instanceId: string, pool: typeof families): number {
  let n = 0;
  for (const fam of pool) if ((fam.byInst.get(instanceId) ?? []).some((g) => areDuplicateFindings(g, f))) n += 1;
  return n;
}
interface RPF { R: number; P: number; F1: number; fpp: number }
/** Evaluate a base's per-instance union, keeping only findings with >= minFams corroborators from `pool`. */
function run(base: Base, minFams: number, pool: typeof families): RPF {
  const evaluator = new GroundTruthEvaluator({ matcher: new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(base.cache), semanticThreshold: TAU }) });
  const runs = insts.map((i) => {
    const r = base.byInst.get(i)!;
    return { ...r, producedFindings: minFams <= 0 ? r.producedFindings : r.producedFindings.filter((f) => corroborators(f, i, pool) >= minFams) };
  });
  const rs = runs.map((r) => evaluator.evaluate(r)); const n = rs.length || 1;
  return {
    R: rs.reduce((a, x) => a + x.recall, 0) / n, P: rs.reduce((a, x) => a + x.precision, 0) / n,
    F1: rs.reduce((a, x) => a + x.f1, 0) / n, fpp: runs.reduce((a, r) => a + r.producedFindings.length, 0) / n,
  };
}
const fmt = (name: string, x: RPF): string =>
  `${name.padEnd(24)} R ${(x.R * 100).toFixed(0)}%  P ${(x.P * 100).toFixed(0)}%  F1 ${x.F1.toFixed(2)}  f/PR ${x.fpp.toFixed(1)}`;

for (const base of [conditioned, independent]) {
  console.log(`── base: ${base.label} — Haiku, K=3 union ──`);
  console.log(fmt("  raw union (no filter)", run(base, 0, families)));
  console.log(fmt("  × cross-family ≥1 (6)", run(base, 1, families)));
  console.log(fmt("  × cross-family ≥2 (6)", run(base, 2, families)));
  console.log(fmt("  × cross-family ≥3 (6)", run(base, 3, families)));
  console.log(fmt("  × Kimi+GLM ≥1", run(base, 1, kimiGlm)));
  console.log(fmt("  × Kimi+GLM ≥2", run(base, 2, kimiGlm)));
  console.log("");
}
console.log(`Head-to-head (same 6-family ≥1 filter, same PRs): does conditioning's coverage survive corroboration?`);
const cF = run(conditioned, 1, families), iF = run(independent, 1, families);
console.log(`  conditioned×filter  R ${(cF.R * 100).toFixed(0)}%  vs  independent×filter  R ${(iF.R * 100).toFixed(0)}%` +
  `   (Δrecall ${((cF.R - iF.R) * 100).toFixed(0)}pp; P ${(cF.P * 100).toFixed(0)}% vs ${(iF.P * 100).toFixed(0)}%)`);
console.log(`\nRead: a large positive Δrecall ⇒ conditioning surfaces real rare issues the filter keeps (net-positive front-end).`);
console.log(`Δrecall ≈ 0 (or negative) ⇒ the 67% coverage was corroboration-fragile: rare-to-Haiku ⇒ rare-to-everyone,`);
console.log(`so the filter discards exactly what conditioning added. EXPLORATORY; structural corroboration proxy for the pair judge.`);
