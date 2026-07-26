/**
 * Error-type-specialist analysis (doc-17). Two questions:
 *  (1) Per-type recall — does a type-focused agent recover MORE of ITS type than
 *      the generalist? (attention) or is the blind spot a recognition ceiling?
 *  (2) Team (union of type specialists) vs the generalist and vs the
 *      compute-matched multi-sample / cross-family unions (is type prompting a
 *      real decorrelation source, or ≈ the H2 null?).
 * ZERO LLM calls.
 *
 * Env: CONV_RUNS/FUNC_RUNS/TEAM_RUNS/TS_CACHE (module-arm/type-spec-*),
 *      GEN_RUNS/GEN_CACHE (phase2-results/qodo-all-*),
 *      HAIKU07_RUNS/HAIKU07_CACHE (ladder-haiku07; compute-matched, optional),
 *      KIMI_RUNS/HETERO_CACHE (cross-family K=2, optional),
 *      SEMANTIC_THRESHOLD (=0.7).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { areDuplicateFindings } from "../src/architectures/shared/finding-dedup.ts";

const rr = join(import.meta.dirname, "..");
const P = (e: string, d: string): string => resolve(process.env[e] ?? d);
const CONV = P("CONV_RUNS", "module-arm/type-spec-convention-runs.json");
const FUNC = P("FUNC_RUNS", "module-arm/type-spec-functional-runs.json");
const TEAM = P("TEAM_RUNS", "module-arm/type-spec-team-runs.json");
const TS_CACHE = P("TS_CACHE", "module-arm/type-spec-cache.json");
const GEN = P("GEN_RUNS", join(rr, "phase2-results", "qodo-all-runs.json"));
const GEN_CACHE = P("GEN_CACHE", join(rr, "phase2-results", "qodo-all-cache.json"));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const H07 = process.env.HAIKU07_RUNS ? resolve(process.env.HAIKU07_RUNS) : undefined;
const H07C = process.env.HAIKU07_CACHE ? resolve(process.env.HAIKU07_CACHE) : undefined;
const KIMI = process.env.KIMI_RUNS ? resolve(process.env.KIMI_RUNS) : undefined;
const XC = process.env.HETERO_CACHE ? resolve(process.env.HETERO_CACHE) : undefined;

const normPath = (p: string): string => p.trim().replace(/^\.\//, "");
const isRule = (g: GroundTruthIssue): boolean => !!(g.category && g.category.trim());
function load<T>(p: string): T { if (!existsSync(p)) { console.error(`missing: ${p}`); process.exit(1); } return JSON.parse(readFileSync(p, "utf8")) as T; }
function matched(f: ReviewFinding, g: GroundTruthIssue, c: SemanticScoreCache): boolean {
  return normPath(g.file) === normPath(f.file) && ((f.line >= g.lineStart && f.line <= g.lineEnd) || (c.get(f, g) ?? 0) >= TAU);
}
function byInstance(runs: BenchmarkRun[]): Map<string, BenchmarkRun[]> {
  const m = new Map<string, BenchmarkRun[]>();
  for (const r of runs) if (r.architecture === "agentless") m.set(r.instanceId, [...(m.get(r.instanceId) ?? []), r]);
  return m;
}
/** Micro recall restricted to a GT type ("rule" | "func" | "all") over instance set. */
function recallByType(bi: Map<string, BenchmarkRun[]>, cache: SemanticScoreCache, insts: string[], type: "rule" | "func" | "all"): number {
  let hit = 0, n = 0;
  for (const i of insts) for (const run of bi.get(i) ?? []) for (const g of run.groundTruth) {
    if (type === "rule" && !isRule(g)) continue;
    if (type === "func" && isRule(g)) continue;
    n += 1; if (run.producedFindings.some((f) => matched(f, g, cache))) hit += 1;
  }
  return n ? hit / n : 0;
}
function precisionMicro(bi: Map<string, BenchmarkRun[]>, cache: SemanticScoreCache, insts: string[]): { p: number; fpr: number } {
  let tp = 0, tot = 0;
  for (const i of insts) for (const run of bi.get(i) ?? []) for (const f of run.producedFindings) { tot += 1; if (run.groundTruth.some((g) => matched(f, g, cache))) tp += 1; }
  return { p: tot ? tp / tot : 0, fpr: tot / (insts.length || 1) };
}

const convBI = byInstance(load<BenchmarkRun[]>(CONV)), funcBI = byInstance(load<BenchmarkRun[]>(FUNC)), teamBI = byInstance(load<BenchmarkRun[]>(TEAM));
const tsC = SemanticScoreCache.fromJSON(load<Record<string, number>>(TS_CACHE));
const genBI = byInstance(load<BenchmarkRun[]>(GEN)); const genC = SemanticScoreCache.fromJSON(load<Record<string, number>>(GEN_CACHE));
const insts = [...teamBI.keys()].filter((i) => genBI.has(i)).sort();
console.log(`Type-specialist — ${insts.length} paired Qodo PRs (semantic τ=${TAU})\n`);

console.log(`=== (1) per-type recall: does focus beat the generalist on its own type? ===`);
console.log(`  RULE-GT      generalist ${(recallByType(genBI, genC, insts, "rule") * 100).toFixed(0)}%  →  convention-agent ${(recallByType(convBI, tsC, insts, "rule") * 100).toFixed(0)}%`);
console.log(`  FUNC-GT      generalist ${(recallByType(genBI, genC, insts, "func") * 100).toFixed(0)}%  →  functional-agent ${(recallByType(funcBI, tsC, insts, "func") * 100).toFixed(0)}%`);
console.log(`  (cross-check) convention-agent on FUNC-GT ${(recallByType(convBI, tsC, insts, "func") * 100).toFixed(0)}%   functional-agent on RULE-GT ${(recallByType(funcBI, tsC, insts, "rule") * 100).toFixed(0)}%`);

const teamP = precisionMicro(teamBI, tsC, insts), genP = precisionMicro(genBI, genC, insts);
console.log(`\n=== (2) team (union of type specialists, ${insts.length > 0 ? (teamBI.get(insts[0]!)?.length ?? 1) : 1} agents) vs baselines — total recall/precision ===`);
console.log(`  generalist single   R ${(recallByType(genBI, genC, insts, "all") * 100).toFixed(0)}%  P ${(genP.p * 100).toFixed(0)}%  findings/PR ${genP.fpr.toFixed(1)}`);
console.log(`  type-specialist team R ${(recallByType(teamBI, tsC, insts, "all") * 100).toFixed(0)}%  P ${(teamP.p * 100).toFixed(0)}%  findings/PR ${teamP.fpr.toFixed(1)}`);

if (H07 && H07C) {
  const h = byInstance(load<BenchmarkRun[]>(H07)); const hc = SemanticScoreCache.fromJSON(load<Record<string, number>>(H07C));
  // compute-matched K=2: union of first 2 temp-0.7 samples
  const u2 = new Map<string, BenchmarkRun[]>();
  for (const i of insts) { const rs = (h.get(i) ?? []).slice(0, 2); if (rs.length) { const f: ReviewFinding[] = []; for (const r of rs) for (const x of r.producedFindings) if (!f.some((k) => areDuplicateFindings(k, x))) f.push(x); u2.set(i, [{ ...rs[0]!, producedFindings: f }]); } }
  console.log(`  compute-matched K=2 R ${(recallByType(u2, hc, insts, "all") * 100).toFixed(0)}%  P ${(precisionMicro(u2, hc, insts).p * 100).toFixed(0)}%   (2 temp-0.7 samples — same 2-call budget)`);
}
if (KIMI && XC) {
  const k = byInstance(load<BenchmarkRun[]>(KIMI)); const xc = SemanticScoreCache.fromJSON(load<Record<string, number>>(XC));
  const cf = new Map<string, BenchmarkRun[]>();
  for (const i of insts) { const g = genBI.get(i)?.[0]; const km = k.get(i)?.[0]; if (g && km) { const f = [...g.producedFindings]; for (const x of km.producedFindings) if (!f.some((y) => areDuplicateFindings(y, x))) f.push(x); cf.set(i, [{ ...g, producedFindings: f }]); } }
  // cross-family recall needs per-member caches; approximate with gen cache for Haiku part + hetero for Kimi via combined lookup
  const combined = SemanticScoreCache.fromJSON({ ...load<Record<string, number>>(GEN_CACHE), ...load<Record<string, number>>(XC) });
  console.log(`  cross-family K=2    R ${(recallByType(cf, combined, insts, "all") * 100).toFixed(0)}%  P ${(precisionMicro(cf, combined, insts).p * 100).toFixed(0)}%   (Haiku+Kimi — same 2-call budget)`);
}
console.log(`\nEXPLORATORY. Per-type recall isolates whether type-focus rescues a blind spot (attention) or hits a recognition ceiling. Team-vs-compute-matched isolates type-prompting as a decorrelation source.`);
