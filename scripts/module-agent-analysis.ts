/**
 * Module-agent analysis (doc-17, Phase 1). Pairs the whole-PR single reviewer
 * (A0 = frozen Haiku agentless, phase2-results/qodo-all) against the module-union
 * reviewer (A1 = module-agent-eval.ts) on the same Qodo PRs. Δ = A1 − A0. The
 * sharp test: does splitting the PR by module HURT recall on defects whose PR
 * spans multiple modules (per-module agents are blind across module boundaries)?
 * Results are stratified by GT module-multiplicity. ZERO LLM calls.
 *
 * Env: A0_RUNS/A0_CACHE (phase2-results/qodo-all-{runs,cache}.json),
 *      A1_RUNS/A1_CACHE (module-arm/union-{runs,cache}.json),
 *      SEMANTIC_THRESHOLD (=0.7), BOOT_ITERS (=2000), SEED (=20260723).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { moduleOf } from "../src/architectures/module-partition.ts";
import { wilcoxonSignedRank, bootstrapPairedCI, mean } from "../src/analysis/stats.ts";

const P = (env: string, def: string): string => resolve(process.env[env] ?? def);
const A0_RUNS = P("A0_RUNS", join(import.meta.dirname, "..", "phase2-results", "qodo-all-runs.json"));
const A0_CACHE = P("A0_CACHE", join(import.meta.dirname, "..", "phase2-results", "qodo-all-cache.json"));
const A1_RUNS = P("A1_RUNS", "module-arm/union-runs.json");
const A1_CACHE = P("A1_CACHE", "module-arm/union-cache.json");
const A0_LABEL = process.env.A0_LABEL ?? "whole-PR (A0)";
const A1_LABEL = process.env.A1_LABEL ?? "module-union (A1)";
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const BOOT = Math.max(200, Number(process.env.BOOT_ITERS ?? 2000));
const SEED = Number(process.env.SEED ?? 20260723);

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
interface Cell { recall: number; precision: number; findings: number; }
function perPR(runs: BenchmarkRun[], cache: SemanticScoreCache): Cell {
  let gHit = 0, gN = 0, tp = 0, fN = 0;
  for (const run of runs) {
    for (const g of run.groundTruth) { gN += 1; if (run.producedFindings.some((f) => matched(f, g, cache))) gHit += 1; }
    for (const f of run.producedFindings) { fN += 1; if (run.groundTruth.some((g) => matched(f, g, cache))) tp += 1; }
  }
  return { recall: gN > 0 ? gHit / gN : 0, precision: fN > 0 ? tp / fN : 0, findings: fN / Math.max(1, runs.length) };
}

const a0 = byInstance(load<BenchmarkRun[]>(A0_RUNS));
const a1 = byInstance(load<BenchmarkRun[]>(A1_RUNS));
const a0c = SemanticScoreCache.fromJSON(load<Record<string, number>>(A0_CACHE));
const a1c = SemanticScoreCache.fromJSON(load<Record<string, number>>(A1_CACHE));
const insts = [...a1.keys()].filter((i) => a0.has(i)).sort();
if (insts.length === 0) { console.error("no paired PRs between A0 and module-union"); process.exit(1); }

// GT module-multiplicity per PR (from A1's full GT)
const gtModules = (runs: BenchmarkRun[]): number => new Set(runs[0]!.groundTruth.map((g) => moduleOf(g.file))).size;
const single = insts.filter((i) => gtModules(a1.get(i)!) <= 1);
const multi = insts.filter((i) => gtModules(a1.get(i)!) >= 2);

console.log(`Module-agent — ${A0_LABEL} vs ${A1_LABEL}, agentless Haiku, ${insts.length} paired Qodo PRs (Δ=A1−A0, semantic τ=${TAU})`);
console.log(`  single-module-GT PRs: ${single.length}   multi-module-GT PRs: ${multi.length}\n`);

function stratum(label: string, ids: string[]): void {
  if (ids.length === 0) { console.log(`=== ${label} (n=0) ===\n`); return; }
  const c0 = ids.map((i) => perPR(a0.get(i)!, a0c));
  const c1 = ids.map((i) => perPR(a1.get(i)!, a1c));
  const dR = c1.map((x, k) => x.recall - c0[k]!.recall);
  const w = wilcoxonSignedRank(dR);
  const ci = bootstrapPairedCI(c1.map((x) => x.recall), c0.map((x) => x.recall), (a, b) => mean(a) - mean(b), { iters: BOOT, seed: SEED });
  console.log(`=== ${label} (n=${ids.length}) ===`);
  console.log(`  recall      A0 ${(mean(c0.map((x) => x.recall)) * 100).toFixed(0)}%  →  A1 ${(mean(c1.map((x) => x.recall)) * 100).toFixed(0)}%   Δ=${(mean(dR) * 100).toFixed(1)}pp  CI[${(ci.lo * 100).toFixed(1)}, ${(ci.hi * 100).toFixed(1)}]  p=${w.p.toFixed(3)} (n=${w.n})`);
  console.log(`  precision   A0 ${(mean(c0.map((x) => x.precision)) * 100).toFixed(0)}%  →  A1 ${(mean(c1.map((x) => x.precision)) * 100).toFixed(0)}%`);
  console.log(`  findings/PR A0 ${mean(c0.map((x) => x.findings)).toFixed(1)}  →  A1 ${mean(c1.map((x) => x.findings)).toFixed(1)}\n`);
}
stratum("ALL PRs", insts);
stratum("single-module-GT PRs (module split should be neutral)", single);
stratum("multi-module-GT PRs (boundary test — split may blind each agent)", multi);
console.log(`EXPLORATORY (Qodo injected defects). A0 = whole-PR single reviewer (frozen Haiku agentless); A1 = per-module agents unioned (Synthesizer dedup). Same model, same total diff; only the module split differs.`);
