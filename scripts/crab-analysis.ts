/**
 * CRAB structural-grounding analysis (doc-16, Phase B). Pairs the diff-only and
 * structural agentless conditions on the same CRAB PRs and reports whether
 * whole-file + 1-hop dependency context lifts review recall over the diff alone.
 * Δ = structural − diff-only. ZERO LLM calls (replays runs + judge caches).
 *
 * Env: DIFFONLY_RUNS/DIFFONLY_CACHE (crab-arm/diffonly-{runs,cache}.json),
 *      STRUCTURAL_RUNS/STRUCTURAL_CACHE (crab-arm/structural-{runs,cache}.json),
 *      CRAB_JSONL (for token-cost recompute), SEMANTIC_THRESHOLD (=0.7),
 *      BOOT_ITERS (=2000), SEED (=20260723).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { wilcoxonSignedRank, bootstrapPairedCI, mean } from "../src/analysis/stats.ts";
import { buildStructuralContext } from "../src/grounding/structural-context.ts";

const P = (env: string, def: string): string => resolve(process.env[env] ?? def);
const DIFFONLY_RUNS = P("DIFFONLY_RUNS", "crab-arm/diffonly-runs.json");
const DIFFONLY_CACHE = P("DIFFONLY_CACHE", "crab-arm/diffonly-cache.json");
const STRUCTURAL_RUNS = P("STRUCTURAL_RUNS", "crab-arm/structural-runs.json");
const STRUCTURAL_CACHE = P("STRUCTURAL_CACHE", "crab-arm/structural-cache.json");
const CRAB_JSONL = P("CRAB_JSONL", "data/benchmark/crab-stage4.jsonl");
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const BOOT = Math.max(200, Number(process.env.BOOT_ITERS ?? 2000));
const SEED = Number(process.env.SEED ?? 20260723);

const normPath = (p: string): string => p.trim().replace(/^\.\//, "");
function load<T>(p: string): T { if (!existsSync(p)) { console.error(`missing: ${p}`); process.exit(1); } return JSON.parse(readFileSync(p, "utf8")) as T; }
function matched(f: ReviewFinding, g: GroundTruthIssue, c: SemanticScoreCache, semantic: boolean): boolean {
  const line = f.line >= g.lineStart && f.line <= g.lineEnd;
  return normPath(g.file) === normPath(f.file) && (line || (semantic && (c.get(f, g) ?? 0) >= TAU));
}
function byInstance(runs: BenchmarkRun[]): Map<string, BenchmarkRun[]> {
  const m = new Map<string, BenchmarkRun[]>();
  for (const r of runs) if (r.architecture === "agentless") m.set(r.instanceId, [...(m.get(r.instanceId) ?? []), r]);
  return m;
}
interface PR { recall: number; precision: number; findings: number; }
function perPR(runs: BenchmarkRun[], cache: SemanticScoreCache, semantic: boolean): PR {
  let gHit = 0, gN = 0, tp = 0, fN = 0;
  for (const run of runs) {
    for (const g of run.groundTruth) { gN += 1; if (run.producedFindings.some((f) => matched(f, g, cache, semantic))) gHit += 1; }
    for (const f of run.producedFindings) { fN += 1; if (run.groundTruth.some((g) => matched(f, g, cache, semantic))) tp += 1; }
  }
  return { recall: gN > 0 ? gHit / gN : 0, precision: fN > 0 ? tp / fN : 0, findings: fN / Math.max(1, runs.length) };
}

const dRuns = byInstance(load<BenchmarkRun[]>(DIFFONLY_RUNS));
const sRuns = byInstance(load<BenchmarkRun[]>(STRUCTURAL_RUNS));
const dCache = SemanticScoreCache.fromJSON(load<Record<string, number>>(DIFFONLY_CACHE));
const sCache = SemanticScoreCache.fromJSON(load<Record<string, number>>(STRUCTURAL_CACHE));
const insts = [...sRuns.keys()].filter((i) => dRuns.has(i)).sort();
if (insts.length === 0) { console.error("no paired CRAB instances"); process.exit(1); }
console.log(`CRAB structural grounding — diff-only vs structural, agentless, ${insts.length} paired PRs (Δ=structural−diff-only)\n`);

for (const semantic of [false, true]) {
  const label = semantic ? `semantic (τ=${TAU})` : "strict (file+line)";
  const d = insts.map((i) => perPR(dRuns.get(i)!, dCache, semantic));
  const s = insts.map((i) => perPR(sRuns.get(i)!, sCache, semantic));
  const dR = s.map((x, k) => x.recall - d[k]!.recall);
  const w = wilcoxonSignedRank(dR);
  const pOne = mean(dR) > 0 ? w.p / 2 : 1 - w.p / 2;
  const ci = bootstrapPairedCI(s.map((x) => x.recall), d.map((x) => x.recall), (a, b) => mean(a) - mean(b), { iters: BOOT, seed: SEED });
  console.log(`=== ${label} ===`);
  console.log(`  recall     diff-only ${(mean(d.map((x) => x.recall)) * 100).toFixed(0)}%  →  structural ${(mean(s.map((x) => x.recall)) * 100).toFixed(0)}%   Δ=${(mean(dR) * 100).toFixed(1)}pp  95% CI[${(ci.lo * 100).toFixed(1)}, ${(ci.hi * 100).toFixed(1)}]  Wilcoxon one-sided p=${pOne.toFixed(4)} (n=${w.n})`);
  console.log(`  precision  diff-only ${(mean(d.map((x) => x.precision)) * 100).toFixed(0)}%  →  structural ${(mean(s.map((x) => x.precision)) * 100).toFixed(0)}%`);
  console.log(`  findings/PR diff-only ${mean(d.map((x) => x.findings)).toFixed(1)}  →  structural ${mean(s.map((x) => x.findings)).toFixed(1)}\n`);
}

// context token cost (recompute; free, cached)
const rows = readFileSync(CRAB_JSONL, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, any>);
const refByInst = new Map<string, { repo: string; base: string; diff: string }>();
for (const r of rows) if (r.commit_to_review?.patch_to_review) refByInst.set(r.instance_id, { repo: r.repo, base: r.base_commit, diff: r.commit_to_review.patch_to_review });
let toks: number[] = [];
for (const i of insts) {
  const ref = refByInst.get(i); if (!ref) continue;
  const paths = [...new Set(ref.diff.split("\n").filter((l) => l.startsWith("+++ ")).map((l) => l.slice(4).replace(/^b\//, "").trim()).filter((p) => p !== "/dev/null"))];
  toks.push(buildStructuralContext(ref.repo, ref.base, paths).tokensApprox);
}
console.log(`Injected structural context: mean ~${Math.round(mean(toks))} tok/PR (median ~${[...toks].sort((a, b) => a - b)[Math.floor(toks.length / 2)] ?? 0}).`);
console.log(`\nEXPLORATORY (CRAB, human review comments, Python). Δ isolates injected context; same model/arm/PRs. Recall vs real human comments is a soft lower bound (semantic judge).`);
