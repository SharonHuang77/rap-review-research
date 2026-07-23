/**
 * Single strong model vs cross-family union (doc-14 §confirmatory follow-up).
 * Answers: does upgrading the base model (Haiku→Sonnet) SUBSTITUTE for cross-family
 * verification? Same call budget (3), three agentless "teams" on the same 80-PR
 * remainder, union recall (a golden issue is recovered if ANY member finds it):
 *
 *   homo-Haiku-3run   : union of Haiku's 3 runs           (within-model recurrence)
 *   hetero-3family    : union of {Haiku, Kimi, GLM} run#1  (cross-family diversity)
 *   homo-Sonnet-3run  : union of Sonnet's 3 runs           (a STRONGER single model)
 *
 * If Sonnet-3run-union < hetero-3family-union, a stronger model does NOT replace
 * family diversity — cross-family verification remains the distinct lever.
 * EXPLORATORY (reuses already-collected/inspected data); ZERO LLM calls.
 *
 * Env: SONNET_RUNS/SONNET_CACHE (capability-arm/sonnet-agentless-{runs,cache}.json),
 *      HAIKU_RUNS/HAIKU_CACHE (phase2-results/qodo-all-{runs,cache}.json),
 *      KIMI_RUNS (hetero-confirmatory/hetero-runs-moonshotai.kimi-k2.5.json),
 *      GLM_RUNS (hetero-confirmatory/hetero-runs-zai.glm-5.json),
 *      HETERO_CACHE (hetero-confirmatory/hetero-cache.json),
 *      SEMANTIC_THRESHOLD (=0.7).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { areDuplicateFindings } from "../src/architectures/shared/finding-dedup.ts";

const P = (env: string, def: string): string => resolve(process.env[env] ?? def);
const rr = join(import.meta.dirname, "..");
const SONNET_RUNS = P("SONNET_RUNS", "capability-arm/sonnet-agentless-runs.json");
const SONNET_CACHE = P("SONNET_CACHE", "capability-arm/sonnet-agentless-cache.json");
const HAIKU_RUNS = P("HAIKU_RUNS", join(rr, "phase2-results", "qodo-all-runs.json"));
const HAIKU_CACHE = P("HAIKU_CACHE", join(rr, "phase2-results", "qodo-all-cache.json"));
const KIMI_RUNS = P("KIMI_RUNS", join(rr, "hetero-confirmatory", "hetero-runs-moonshotai.kimi-k2.5.json"));
const GLM_RUNS = P("GLM_RUNS", join(rr, "hetero-confirmatory", "hetero-runs-zai.glm-5.json"));
const HETERO_CACHE = P("HETERO_CACHE", join(rr, "hetero-confirmatory", "hetero-cache.json"));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);

type Cat = "rule" | "func";
const normPath = (p: string): string => p.trim().replace(/^\.\//, "");
const bucket = (g: GroundTruthIssue): Cat => (g.category && g.category.trim() ? "rule" : "func");
function load<T>(path: string): T { if (!existsSync(path)) { console.error(`missing: ${path}`); process.exit(1); } return JSON.parse(readFileSync(path, "utf8")) as T; }
function cacheOf(path: string): SemanticScoreCache { return SemanticScoreCache.fromJSON(load<Record<string, number>>(path)); }
function matched(f: ReviewFinding, g: GroundTruthIssue, cache: SemanticScoreCache): boolean {
  return normPath(g.file) === normPath(f.file) &&
    ((f.line >= g.lineStart && f.line <= g.lineEnd) || (cache.get(f, g) ?? 0) >= TAU);
}
function byInstance(runs: BenchmarkRun[]): Map<string, BenchmarkRun[]> {
  const m = new Map<string, BenchmarkRun[]>();
  for (const r of runs) if (r.architecture === "agentless") m.set(r.instanceId, [...(m.get(r.instanceId) ?? []), r]);
  return m;
}

const sCache = cacheOf(SONNET_CACHE), hCache = cacheOf(HAIKU_CACHE), xCache = cacheOf(HETERO_CACHE);
const sBI = byInstance(load<BenchmarkRun[]>(SONNET_RUNS));
const hBI = byInstance(load<BenchmarkRun[]>(HAIKU_RUNS));
const kBI = byInstance(load<BenchmarkRun[]>(KIMI_RUNS));
const gBI = byInstance(load<BenchmarkRun[]>(GLM_RUNS));
const insts = [...sBI.keys()].filter((i) => hBI.has(i) && kBI.has(i) && gBI.has(i)).sort();
console.log(`Single strong model vs cross-family union — agentless, ${insts.length} paired PRs (τ=${TAU})\n`);

interface Member { run: BenchmarkRun; cache: SemanticScoreCache; }
type TeamFn = (id: string) => Member[];
const homoHaiku: TeamFn = (id) => (hBI.get(id) ?? []).map((run) => ({ run, cache: hCache }));
const homoSonnet: TeamFn = (id) => (sBI.get(id) ?? []).map((run) => ({ run, cache: sCache }));
const hetero3: TeamFn = (id) => [
  { run: hBI.get(id)![0]!, cache: hCache },
  { run: kBI.get(id)![0]!, cache: xCache },
  { run: gBI.get(id)![0]!, cache: xCache },
];

interface Agg { ruleHit: number; ruleN: number; funcHit: number; funcN: number; tp: number; uniq: number; }
function evalTeam(team: TeamFn): Agg {
  const a: Agg = { ruleHit: 0, ruleN: 0, funcHit: 0, funcN: 0, tp: 0, uniq: 0 };
  for (const id of insts) {
    const members = team(id);
    const gt = members[0]!.run.groundTruth;
    for (const g of gt) {
      const hit = members.some((m) => m.run.producedFindings.some((f) => matched(f, g, m.cache)));
      if (bucket(g) === "rule") { a.ruleN += 1; if (hit) a.ruleHit += 1; }
      else { a.funcN += 1; if (hit) a.funcHit += 1; }
    }
    // union precision: dedupe findings across members, TP if it matches any GT under its own cache
    const kept: ReviewFinding[] = [];
    const keptCaches: SemanticScoreCache[] = [];
    for (const m of members) for (const f of m.run.producedFindings) {
      if (kept.some((k) => areDuplicateFindings(k, f))) continue;
      kept.push(f); keptCaches.push(m.cache);
    }
    for (let i = 0; i < kept.length; i += 1) {
      a.uniq += 1;
      if (gt.some((g) => matched(kept[i]!, g, keptCaches[i]!))) a.tp += 1;
    }
  }
  return a;
}

const teams: [string, TeamFn][] = [
  ["homo-Haiku 3-run", homoHaiku],
  ["hetero 3-family", hetero3],
  ["homo-Sonnet 3-run", homoSonnet],
];
const rate = (h: number, n: number): string => (n > 0 ? `${((h / n) * 100).toFixed(0)}%` : "–");
console.log("team".padEnd(20) + "  union-R(all)  R(func)  R(rule)   precision   uniq-findings/PR");
const results: Record<string, Agg> = {};
for (const [label, fn] of teams) {
  const a = evalTeam(fn);
  results[label] = a;
  const allHit = a.ruleHit + a.funcHit, allN = a.ruleN + a.funcN;
  console.log(
    label.padEnd(20) +
    `  ${rate(allHit, allN).padStart(9)}  ${rate(a.funcHit, a.funcN).padStart(7)}  ${rate(a.ruleHit, a.ruleN).padStart(7)}` +
    `   ${rate(a.tp, a.uniq).padStart(9)}   ${(a.uniq / insts.length).toFixed(1).padStart(6)}`,
  );
}

const het = results["hetero 3-family"]!, son = results["homo-Sonnet 3-run"]!, hai = results["homo-Haiku 3-run"]!;
const uR = (a: Agg): number => (a.ruleHit + a.funcHit) / (a.ruleN + a.funcN);
console.log(`\nInterpretation (union recall, all defect types):`);
console.log(`  homo-Haiku ${(uR(hai) * 100).toFixed(0)}%  <  hetero 3-family ${(uR(het) * 100).toFixed(0)}%  ${uR(son) >= uR(het) ? ">=" : "vs"}  homo-Sonnet ${(uR(son) * 100).toFixed(0)}%`);
console.log(
  uR(son) >= uR(het)
    ? `  → a stronger single model (Sonnet) MATCHES/EXCEEDS the cross-family union: capability can substitute for family diversity here.`
    : `  → even the stronger single model (Sonnet ${(uR(son) * 100).toFixed(0)}%) does NOT reach the cross-family union (${(uR(het) * 100).toFixed(0)}%): cross-family verification is a distinct lever, not replaced by model strength.`,
);
console.log(`\nEXPLORATORY (reuses collected data). Union recall = golden issue found by ANY member; same 3-call budget across teams.`);
