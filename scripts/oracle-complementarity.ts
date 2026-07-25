/**
 * Oracle ceiling + complementarity matrix (doc-17 §8, item ④; zero-LLM).
 *
 * Two decorrelation artifacts computed by pure set algebra over the ALREADY-cached
 * findings + judge caches of every method/family we have run — NO LLM calls:
 *
 *  (1) ORACLE CEILING — union recall across ALL cached sources (7 families +
 *      conditioned + the Haiku temperature sweep T0/0.3/0.7/1.0). This is the
 *      absolute fraction of ground-truth issues *reachable* by SOME configuration
 *      we tried, i.e. the ceiling any ensemble/selector could hit. The gap between
 *      the best single method (~65–67%) and this ceiling bounds how much any smarter
 *      combiner (aspect verifiers ①, agentic ②) could still add. Leave-one-out per
 *      source = its UNIQUE marginal contribution to the ceiling.
 *
 *  (2) COMPLEMENTARITY MATRIX — pairwise union recall for the 7 families +
 *      conditioned. Diagonal = solo recall; off-diagonal[A][B] = recall of A∪B. The
 *      biggest lifts over the solo diagonal are the most DECORRELATED (complementary)
 *      pairs — the quantitative substrate of the §2 "+3pp cross-family" story: it is
 *      real precisely because different families cover disjoint true issues.
 *
 * Coverage uses the same structural+semantic proxy as §6/§7.1 (file + line-range OR
 * cached semantic score ≥ τ). Each source is scored with its OWN judge cache — never
 * a merged one — so every method's coverage matches exactly how it was measured in
 * §2/§6/§7.1; the oracle/union is then pure set-union of those per-source covered
 * GT-id sets. Recall is macro (mean of per-PR coverage). Sanity: homo-T0.7 solo
 * should reproduce the §6 T=0.7 raw union (~61%) and the 7-family union the §2 ladder
 * ceiling (~65–66%).
 *
 * Env: SEMANTIC_THRESHOLD (=0.7). Run: node scripts/oracle-complementarity.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { areDuplicateFindings } from "../src/architectures/shared/finding-dedup.ts";

const rr = join(import.meta.dirname, "..");
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const p = (...s: string[]): string => join(rr, ...s);

// name, runs, cache, inMatrix (families + conditioned) — temperature variants are ceiling-only.
const SOURCES: readonly [string, string, string, boolean][] = [
  ["homo-T0.7", p("hetero-confirmatory", "ladder-haiku07-runs.json"), p("hetero-confirmatory", "ladder-haiku07-cache.json"), true],
  ["kimi", p("hetero-confirmatory", "hetero-runs-moonshotai.kimi-k2.5.json"), p("hetero-confirmatory", "hetero-cache.json"), true],
  ["glm", p("hetero-confirmatory", "hetero-runs-zai.glm-5.json"), p("hetero-confirmatory", "hetero-cache.json"), true],
  ["deepseek", p("hetero-confirmatory", "ladder-deepseek-runs.json"), p("hetero-confirmatory", "ladder-deepseek-cache.json"), true],
  ["nova", p("hetero-confirmatory", "ladder-nova-runs.json"), p("hetero-confirmatory", "ladder-nova-cache.json"), true],
  ["llama4", p("hetero-confirmatory", "ladder-llama4-runs.json"), p("hetero-confirmatory", "ladder-llama4-cache.json"), true],
  ["palmyra", p("hetero-confirmatory", "ladder-palmyra-runs.json"), p("hetero-confirmatory", "ladder-palmyra-cache.json"), true],
  ["conditioned", p("module-arm", "conditioned-union-runs.json"), p("module-arm", "conditioned-cache.json"), true],
  ["temp-T0", p("phase2-results", "qodo-all-runs.json"), p("phase2-results", "qodo-all-cache.json"), false],
  ["temp-T0.3", p("hetero-confirmatory", "tempsweep-T03-runs.json"), p("hetero-confirmatory", "tempsweep-T03-cache.json"), false],
  ["temp-T1.0", p("hetero-confirmatory", "tempsweep-T10-runs.json"), p("hetero-confirmatory", "tempsweep-T10-cache.json"), false],
];

function load<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
const dedup = (fs: ReviewFinding[]): ReviewFinding[] => { const o: ReviewFinding[] = []; for (const f of fs) if (!o.some((k) => areDuplicateFindings(k, f))) o.push(f); return o; };
const normPath = (s: string): string => s.trim().replace(/^\.\//, "");

const matched = (f: ReviewFinding, g: GroundTruthIssue, cache: SemanticScoreCache): boolean =>
  normPath(g.file) === normPath(f.file) && ((f.line >= g.lineStart && f.line <= g.lineEnd) || (cache.get(f, g) ?? 0) >= TAU);

const cacheCache = new Map<string, SemanticScoreCache>(); // memoize shared caches (kimi/glm share hetero-cache)
const loadCache = (path: string): SemanticScoreCache => {
  if (!cacheCache.has(path)) cacheCache.set(path, SemanticScoreCache.fromJSON(load<Record<string, number>>(path)));
  return cacheCache.get(path)!;
};

interface Source { name: string; inMatrix: boolean; byInst: Map<string, ReviewFinding[]>; cache: SemanticScoreCache }
const gtByInst = new Map<string, GroundTruthIssue[]>();
const sources: Source[] = [];
for (const [name, runsPath, cachePath, inMatrix] of SOURCES) {
  if (!existsSync(runsPath) || !existsSync(cachePath)) { console.log(`  (skip missing source ${name})`); continue; }
  const runs = load<BenchmarkRun[]>(runsPath).filter((r) => r.architecture === "agentless");
  const g = new Map<string, ReviewFinding[]>();
  for (const r of runs) {
    g.set(r.instanceId, [...(g.get(r.instanceId) ?? []), ...r.producedFindings]);
    if (!gtByInst.has(r.instanceId)) gtByInst.set(r.instanceId, r.groundTruth);
  }
  const byInst = new Map<string, ReviewFinding[]>();
  for (const [i, fs] of g) byInst.set(i, dedup(fs));
  sources.push({ name, inMatrix, byInst, cache: loadCache(cachePath) });
}

// common instance set: present in EVERY loaded source (so every method is scored on identical PRs)
let insts = [...sources[0]!.byInst.keys()];
for (const s of sources) insts = insts.filter((i) => s.byInst.has(i));
insts = insts.filter((i) => (gtByInst.get(i)?.length ?? 0) > 0);
console.log(`Oracle ceiling + complementarity — ${insts.length} Qodo PRs, ${sources.length} cached sources, per-source caches (τ=${TAU}).`);
console.log(`(each source = its FULL multi-run union under the §6/§7.1 coverage proxy, macro over PRs; sits ~3pp above the §2 single-draw-per-family ladder by construction.)\n`);

/** Per-instance set of GT issue-ids a finding-set covers, using that source's own cache. */
function coveredIds(findings: ReviewFinding[], gt: GroundTruthIssue[], cache: SemanticScoreCache): Set<string> {
  const s = new Set<string>();
  for (const g of gt) if (findings.some((f) => matched(f, g, cache))) s.add(g.id);
  return s;
}
// precompute per-source per-instance covered id-sets (each with its own cache)
const cov = new Map<string, Map<string, Set<string>>>();
for (const s of sources) {
  const m = new Map<string, Set<string>>();
  for (const i of insts) m.set(i, coveredIds(s.byInst.get(i) ?? [], gtByInst.get(i)!, s.cache));
  cov.set(s.name, m);
}
/** Macro recall (mean over PRs) of a per-instance covered-id-set builder. */
const macroRecall = (build: (i: string) => Set<string>): number => {
  let sum = 0;
  for (const i of insts) { const gt = gtByInst.get(i)!; sum += gt.length ? build(i).size / gt.length : 0; }
  return sum / (insts.length || 1);
};
const solo = (name: string): number => macroRecall((i) => cov.get(name)!.get(i)!);
const unionOf = (names: string[]): number => macroRecall((i) => { const u = new Set<string>(); for (const n of names) for (const id of cov.get(n)!.get(i)!) u.add(id); return u; });

// (1) solo recall, sorted
console.log("── solo coverage recall (macro over PRs) ──");
const bySolo = [...sources].map((s) => ({ n: s.name, r: solo(s.name) })).sort((a, b) => b.r - a.r);
for (const { n, r } of bySolo) console.log(`  ${n.padEnd(12)} ${(r * 100).toFixed(0)}%`);
const bestSingle = bySolo[0]!;

// (1) oracle ceiling over ALL sources + leave-one-out marginals
const allNames = sources.map((s) => s.name);
const oracle = unionOf(allNames);
console.log(`\n── ORACLE CEILING (union of all ${sources.length} sources) ──`);
console.log(`  reachable-set recall = ${(oracle * 100).toFixed(0)}%   (best single = ${bestSingle.n} ${(bestSingle.r * 100).toFixed(0)}%; gap ${((oracle - bestSingle.r) * 100).toFixed(0)}pp)`);
console.log("  leave-one-out UNIQUE marginal (ceiling − ceiling without source):");
const loo = allNames.map((n) => ({ n, d: oracle - unionOf(allNames.filter((x) => x !== n)) })).sort((a, b) => b.d - a.d);
for (const { n, d } of loo) console.log(`    ${n.padEnd(12)} ${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}pp`);

// (1b) families-only ceiling (the 7 families, no conditioning, no temp variants) — the honest cross-family ceiling
const famNames = sources.filter((s) => s.inMatrix && s.name !== "conditioned").map((s) => s.name);
console.log(`\n  cross-family-only ceiling (7 families full-union) = ${(unionOf(famNames) * 100).toFixed(0)}%   (full-union basis; cf. §2 single-draw ladder 66%)`);
console.log(`  +conditioned                                     = ${(unionOf([...famNames, "conditioned"]) * 100).toFixed(0)}%`);

// (2) complementarity matrix (families + conditioned): pairwise union recall, diagonal = solo
const M = sources.filter((s) => s.inMatrix).map((s) => s.name);
console.log(`\n── COMPLEMENTARITY MATRIX — pairwise union recall %% (diagonal = solo) ──`);
console.log("             " + M.map((n) => n.slice(0, 6).padStart(7)).join(""));
for (const a of M) {
  const row = M.map((b) => (a === b ? solo(a) : unionOf([a, b])));
  console.log(`  ${a.padEnd(11)}` + row.map((v) => `${(v * 100).toFixed(0)}%`.padStart(7)).join(""));
}
// most complementary pairs (largest union − max(solo))
const pairs: { a: string; b: string; lift: number; u: number }[] = [];
for (let x = 0; x < M.length; x += 1) for (let y = x + 1; y < M.length; y += 1) {
  const a = M[x]!, b = M[y]!; const u = unionOf([a, b]); pairs.push({ a, b, u, lift: u - Math.max(solo(a), solo(b)) });
}
pairs.sort((p1, p2) => p2.lift - p1.lift);
console.log(`\n  most COMPLEMENTARY pairs (union − best-solo = decorrelation lift):`);
for (const { a, b, u, lift } of pairs.slice(0, 6)) console.log(`    ${a} + ${b}: union ${(u * 100).toFixed(0)}%  (+${(lift * 100).toFixed(0)}pp over best solo)`);
console.log(`\nEXPLORATORY; zero-LLM; coverage = structural+semantic proxy (τ=${TAU}) consistent with §6/§7.1. Recall macro over PRs.`);
