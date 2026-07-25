/**
 * Temperature × downstream-filter analysis (doc-17 follow-up). Tests the claim
 * that a downstream verification filter lets you push GENERATION temperature
 * higher (buy coverage) and reclaim precision with the filter. For each
 * generation temperature T (K=3 Haiku agentless runs), computes three pipelines:
 *   raw          — union of the 3 runs (no filter)
 *   self-consist — keep findings recurring in >=2 of the 3 same-T runs
 *   cross-family — keep union findings corroborated by >=1 other family (Kimi/GLM)
 * and reports recall / precision / F1 vs T. If the filtered pipelines' F1 (or P-R
 * frontier) peaks at HIGHER T than raw, the claim holds — and it reframes the
 * registered H-verify null (self-consistency may only discriminate once T
 * decorrelates the samples). ZERO LLM calls. Structural corroboration
 * (areDuplicateFindings) is a cheap proxy for the paper's semantic pair judge.
 *
 * Env: TEMPS = "T:runsPrefix,..." (runs=<prefix>-runs.json, cache=<prefix>-cache.json),
 *      KIMI_RUNS, GLM_RUNS, HETERO_CACHE, SEMANTIC_THRESHOLD (=0.7).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { areDuplicateFindings } from "../src/architectures/shared/finding-dedup.ts";

const rr = join(import.meta.dirname, "..");
const TEMPS = (process.env.TEMPS ??
  `0:${join(rr, "phase2-results", "qodo-all")},` +
  `0.3:${join(rr, "hetero-confirmatory", "tempsweep-T03")},` +
  `0.7:${join(rr, "hetero-confirmatory", "ladder-haiku07")},` +
  `1.0:${join(rr, "hetero-confirmatory", "tempsweep-T10")},` +
  `1.3:${join(rr, "hetero-confirmatory", "tempsweep-T13")}`
).split(",").map((s) => s.trim()).filter(Boolean);
const KIMI = resolve(process.env.KIMI_RUNS ?? join(rr, "hetero-confirmatory", "hetero-runs-moonshotai.kimi-k2.5.json"));
const GLM = resolve(process.env.GLM_RUNS ?? join(rr, "hetero-confirmatory", "hetero-runs-zai.glm-5.json"));
const HETERO_CACHE = resolve(process.env.HETERO_CACHE ?? join(rr, "hetero-confirmatory", "hetero-cache.json"));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);

const normPath = (p: string): string => p.trim().replace(/^\.\//, "");
function load<T>(p: string): T { if (!existsSync(p)) { console.error(`missing: ${p}`); process.exit(1); } return JSON.parse(readFileSync(p, "utf8")) as T; }
function matched(f: ReviewFinding, g: GroundTruthIssue, c: SemanticScoreCache): boolean {
  return normPath(g.file) === normPath(f.file) && ((f.line >= g.lineStart && f.line <= g.lineEnd) || (c.get(f, g) ?? 0) >= TAU);
}
function byInstance(runs: BenchmarkRun[]): Map<string, BenchmarkRun[]> {
  const m = new Map<string, BenchmarkRun[]>();
  for (const r of runs) if (r.architecture === "agentless") m.set(r.instanceId, [...(m.get(r.instanceId) ?? []), r]);
  return m;
}
const dedup = (fs: ReviewFinding[]): ReviewFinding[] => { const o: ReviewFinding[] = []; for (const f of fs) if (!o.some((k) => areDuplicateFindings(k, f))) o.push(f); return o; };
/** Union findings recurring in >= minRuns of the instance's runs (structural). */
function recurring(runs: BenchmarkRun[], minRuns: number): ReviewFinding[] {
  const all = runs.flatMap((r) => r.producedFindings.map((f) => ({ f })));
  const kept: ReviewFinding[] = [];
  for (const { f } of all) {
    if (kept.some((k) => areDuplicateFindings(k, f))) continue;
    const nRuns = runs.filter((r) => r.producedFindings.some((x) => areDuplicateFindings(x, f))).length;
    if (nRuns >= minRuns) kept.push(f);
  }
  return kept;
}

// load families for cross-family corroboration
const kimiBI = byInstance(load<BenchmarkRun[]>(KIMI)), glmBI = byInstance(load<BenchmarkRun[]>(GLM));
// load each temperature
interface Temp { t: string; bi: Map<string, BenchmarkRun[]>; cache: SemanticScoreCache; }
const temps: Temp[] = TEMPS.map((spec) => {
  const i = spec.indexOf(":"); const t = spec.slice(0, i); const prefix = spec.slice(i + 1);
  return { t, bi: byInstance(load<BenchmarkRun[]>(resolve(`${prefix}-runs.json`))), cache: SemanticScoreCache.fromJSON(load<Record<string, number>>(resolve(`${prefix}-cache.json`))) };
});
// common instance set across all temps + both families
let insts = [...temps[0]!.bi.keys()];
for (const tp of temps) insts = insts.filter((i) => tp.bi.has(i));
insts = insts.filter((i) => kimiBI.has(i) && glmBI.has(i)).sort();
console.log(`Temperature x filter — ${insts.length} Qodo PRs, K=3 Haiku agentless per T (semantic τ=${TAU})\n`);

interface RPF { R: number; P: number; F1: number; fpp: number; }
function score(perInstFindings: Map<string, ReviewFinding[]>, gtSource: Map<string, BenchmarkRun[]>, cache: SemanticScoreCache): RPF {
  let gHit = 0, gN = 0, tp = 0, tot = 0;
  for (const i of insts) {
    const gt = gtSource.get(i)![0]!.groundTruth;
    const fs = perInstFindings.get(i) ?? [];
    for (const g of gt) { gN += 1; if (fs.some((f) => matched(f, g, cache))) gHit += 1; }
    for (const f of fs) { tot += 1; if (gt.some((g) => matched(f, g, cache))) tp += 1; }
  }
  const R = gN ? gHit / gN : 0, P = tot ? tp / tot : 0;
  return { R, P, F1: R + P > 0 ? (2 * R * P) / (R + P) : 0, fpp: tot / (insts.length || 1) };
}
const fmt = (x: RPF): string => `R ${(x.R * 100).toFixed(0)}%  P ${(x.P * 100).toFixed(0)}%  F1 ${x.F1.toFixed(2)}  f/PR ${x.fpp.toFixed(1)}`;

console.log("T     pipeline        " + "metrics");
for (const tp of temps) {
  const rawU = new Map<string, ReviewFinding[]>();
  const selfC = new Map<string, ReviewFinding[]>();
  const crossF = new Map<string, ReviewFinding[]>();
  for (const i of insts) {
    const runs = tp.bi.get(i)!;
    const union = dedup(runs.flatMap((r) => r.producedFindings));
    rawU.set(i, union);
    selfC.set(i, recurring(runs, 2));
    const fam = [...(kimiBI.get(i)?.[0]?.producedFindings ?? []), ...(glmBI.get(i)?.[0]?.producedFindings ?? [])];
    crossF.set(i, union.filter((f) => fam.some((x) => areDuplicateFindings(x, f))));
  }
  console.log(`\nT=${tp.t}`);
  console.log(`      raw union       ${fmt(score(rawU, tp.bi, tp.cache))}`);
  console.log(`      self-consist>=2 ${fmt(score(selfC, tp.bi, tp.cache))}`);
  console.log(`      cross-family    ${fmt(score(crossF, tp.bi, tp.cache))}`);
}
console.log(`\nEXPLORATORY. Filters use structural corroboration (areDuplicateFindings) as a cheap proxy for the semantic pair judge. Claim holds if the filtered F1 / P-R frontier peaks at higher T than raw.`);
