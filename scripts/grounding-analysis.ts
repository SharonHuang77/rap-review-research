/**
 * Grounding arm (doc 13) — ANALYSIS: the identifying difference-in-differences.
 * Compares grounded vs ungrounded recall SPLIT BY defect type (rule-violation vs
 * functional-bug). The claim is not "grounding lifts recall" (verbosity does
 * that) but "grounding lifts RULE recall specifically" — so the estimand is
 *   DiD = [Δrecall_rule] − [Δrecall_func],   Δ = grounded − ungrounded.
 * Functional bugs are the built-in placebo: they are diff-legible and should
 * move little; if both types rise together the effect is verbosity, not
 * grounding. ZERO LLM calls — replays the grounded pilot runs/caches and the
 * cached ungrounded confirmatory runs (phase2-results/qodo-all-runs.json).
 *
 * Env: UNGROUNDED_RUNS, UNGROUNDED_CACHE (=phase2-results/qodo-all-{runs,cache}.json),
 *      GROUNDED_DIR (=grounding-pilot), REPOS (=Ghost,aspnetcore),
 *      SEMANTIC_THRESHOLD (=0.7), BOOT_ITERS (=2000), SEED (=20260722).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { repoOfInstance } from "../src/grounding/project-conventions.ts";

const P2 = resolve(process.env.UNGROUNDED_RUNS ?? join(import.meta.dirname, "..", "phase2-results", "qodo-all-runs.json"));
const P2CACHE = resolve(process.env.UNGROUNDED_CACHE ?? join(import.meta.dirname, "..", "phase2-results", "qodo-all-cache.json"));
const GDIR = resolve(process.env.GROUNDED_DIR ?? join(import.meta.dirname, "..", "grounding-pilot"));
const REPOS = (process.env.REPOS ?? "Ghost,aspnetcore").split(",").map((s) => s.trim());
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const BOOT = Math.max(200, Number(process.env.BOOT_ITERS ?? 2000));
const SEED = Number(process.env.SEED ?? 20260722);
const ARMS = ["agentless", "hierarchical"] as const;
type Arm = (typeof ARMS)[number];
type Cat = "rule" | "func";

const normPath = (p: string): string => p.trim().replace(/^\.\//, "");
const bucket = (g: GroundTruthIssue): Cat => (g.category && g.category.trim() ? "rule" : "func");

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ungrounded: the cached confirmatory runs + cache
const ungRuns = (JSON.parse(readFileSync(P2, "utf8")) as BenchmarkRun[]);
const ungCache = SemanticScoreCache.fromJSON(JSON.parse(readFileSync(P2CACHE, "utf8")) as Record<string, number>);
// grounded: per-repo pilot runs + merged cache
const gRuns: BenchmarkRun[] = [];
const gCacheObj: Record<string, number> = {};
for (const repo of REPOS) {
  const rf = join(GDIR, `${repo}-runs.json`);
  const cf = join(GDIR, `${repo}-cache.json`);
  if (!existsSync(rf)) { console.error(`missing grounded runs: ${rf}`); process.exit(1); }
  gRuns.push(...(JSON.parse(readFileSync(rf, "utf8")) as BenchmarkRun[]));
  if (existsSync(cf)) Object.assign(gCacheObj, JSON.parse(readFileSync(cf, "utf8")) as Record<string, number>);
}
const gCache = SemanticScoreCache.fromJSON(gCacheObj);

const PILOT = new Set(gRuns.map((r) => r.instanceId));
function matched(f: ReviewFinding, g: GroundTruthIssue, cache: SemanticScoreCache): boolean {
  return normPath(g.file) === normPath(f.file) &&
    ((f.line >= g.lineStart && f.line <= g.lineEnd) || (cache.get(f, g) ?? 0) >= TAU);
}
// group runs by arm+instance for one condition
function byArmInstance(runs: BenchmarkRun[], arm: Arm): Map<string, BenchmarkRun[]> {
  const m = new Map<string, BenchmarkRun[]>();
  for (const r of runs) if (r.architecture === arm && PILOT.has(r.instanceId)) m.set(r.instanceId, [...(m.get(r.instanceId) ?? []), r]);
  return m;
}
// per instance: matched & total GT of each type, summed over that instance's runs
interface Counts { ruleHit: number; ruleN: number; funcHit: number; funcN: number; }
function countsFor(runs: BenchmarkRun[], cache: SemanticScoreCache): Counts {
  const c: Counts = { ruleHit: 0, ruleN: 0, funcHit: 0, funcN: 0 };
  for (const run of runs) {
    for (const g of run.groundTruth) {
      const hit = run.producedFindings.some((f) => matched(f, g, cache));
      if (bucket(g) === "rule") { c.ruleN += 1; if (hit) c.ruleHit += 1; }
      else { c.funcN += 1; if (hit) c.funcHit += 1; }
    }
  }
  return c;
}
interface Unit { u: Counts; g: Counts; } // ungrounded, grounded — same instance
function rate(hit: number, n: number): number { return n > 0 ? hit / n : 0; }
function did(units: Unit[]): { uRule: number; gRule: number; uFunc: number; gFunc: number; dRule: number; dFunc: number; did: number } {
  const s = units.reduce((a, x) => ({ urh: a.urh + x.u.ruleHit, urn: a.urn + x.u.ruleN, ufh: a.ufh + x.u.funcHit, ufn: a.ufn + x.u.funcN, grh: a.grh + x.g.ruleHit, grn: a.grn + x.g.ruleN, gfh: a.gfh + x.g.funcHit, gfn: a.gfn + x.g.funcN }), { urh: 0, urn: 0, ufh: 0, ufn: 0, grh: 0, grn: 0, gfh: 0, gfn: 0 });
  const uRule = rate(s.urh, s.urn), gRule = rate(s.grh, s.grn), uFunc = rate(s.ufh, s.ufn), gFunc = rate(s.gfh, s.gfn);
  const dRule = gRule - uRule, dFunc = gFunc - uFunc;
  return { uRule, gRule, uFunc, gFunc, dRule, dFunc, did: dRule - dFunc };
}

for (const arm of ARMS) {
  const ung = byArmInstance(ungRuns, arm);
  const gro = byArmInstance(gRuns, arm);
  const insts = [...gro.keys()].filter((i) => ung.has(i)).sort();
  const units: Unit[] = insts.map((i) => ({ u: countsFor(ung.get(i)!, ungCache), g: countsFor(gro.get(i)!, gCache) }));
  const point = did(units);
  // instance bootstrap
  const rng = mulberry32(SEED);
  const dids: number[] = [];
  const dRules: number[] = [];
  for (let b = 0; b < BOOT; b += 1) {
    const rs = Array.from({ length: units.length }, () => units[Math.floor(rng() * units.length)]!);
    const d = did(rs); dids.push(d.did); dRules.push(d.dRule);
  }
  const ci = (arr: number[]): [number, number] => { const s = [...arr].sort((a, b) => a - b); return [s[Math.floor(0.025 * arr.length)]!, s[Math.min(arr.length - 1, Math.ceil(0.975 * arr.length) - 1)]!]; };
  const [dRLo, dRHi] = ci(dRules);
  const [didLo, didHi] = ci(dids);
  console.log(`\n=== ${arm} — grounded vs ungrounded recall by defect type (semantic τ=${TAU}; ${insts.length} pilot PRs) ===`);
  console.log(`  RULE recall:       ungrounded ${(point.uRule * 100).toFixed(0)}%  →  grounded ${(point.gRule * 100).toFixed(0)}%   Δ=${(point.dRule * 100).toFixed(1)}pp  CI[${(dRLo * 100).toFixed(1)}, ${(dRHi * 100).toFixed(1)}]`);
  console.log(`  FUNC recall (ctrl): ungrounded ${(point.uFunc * 100).toFixed(0)}%  →  grounded ${(point.gFunc * 100).toFixed(0)}%   Δ=${(point.dFunc * 100).toFixed(1)}pp`);
  console.log(`  DiD (Δrule − Δfunc) = ${(point.did * 100).toFixed(1)}pp   CI[${(didLo * 100).toFixed(1)}, ${(didHi * 100).toFixed(1)}]  ${didLo > 0 ? "→ grounding fills the rule blind spot (not verbosity)" : "→ not separable from verbosity at this N"}`);
}
console.log(`\nExploratory pilot; per-type cells are small (n≈20 PRs). Reads grounded pilot runs + cached confirmatory ungrounded baseline. Difference-in-differences isolates convention-grounding from generic verbosity.`);
