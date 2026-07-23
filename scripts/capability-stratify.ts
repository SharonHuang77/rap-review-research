/**
 * Capability difficulty stratification (doc-14 §confirmatory follow-up). For each
 * ground-truth issue on the 80-PR remainder, classify by whether Haiku found it
 * (∃ Haiku run matches) × whether Sonnet found it — a 2×2 per defect type. Answers:
 * is the stronger model's value concentrated on the residual Haiku MISSES, or does
 * it merely re-find easy issues (and how big is the "neither" hard core that needs
 * grounding/execution — the third lever)? EXPLORATORY; ZERO LLM calls.
 *
 * Env: SONNET_RUNS/SONNET_CACHE, HAIKU_RUNS/HAIKU_CACHE, SEMANTIC_THRESHOLD (=0.7).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";

const rr = join(import.meta.dirname, "..");
const P = (env: string, def: string): string => resolve(process.env[env] ?? def);
const SONNET_RUNS = P("SONNET_RUNS", "capability-arm/sonnet-agentless-runs.json");
const SONNET_CACHE = P("SONNET_CACHE", "capability-arm/sonnet-agentless-cache.json");
const HAIKU_RUNS = P("HAIKU_RUNS", join(rr, "phase2-results", "qodo-all-runs.json"));
const HAIKU_CACHE = P("HAIKU_CACHE", join(rr, "phase2-results", "qodo-all-cache.json"));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);

type Cat = "rule" | "func";
const normPath = (p: string): string => p.trim().replace(/^\.\//, "");
const bucket = (g: GroundTruthIssue): Cat => (g.category && g.category.trim() ? "rule" : "func");
function load<T>(p: string): T { if (!existsSync(p)) { console.error(`missing: ${p}`); process.exit(1); } return JSON.parse(readFileSync(p, "utf8")) as T; }
function matched(f: ReviewFinding, g: GroundTruthIssue, c: SemanticScoreCache): boolean {
  return normPath(g.file) === normPath(f.file) && ((f.line >= g.lineStart && f.line <= g.lineEnd) || (c.get(f, g) ?? 0) >= TAU);
}
function byInstance(runs: BenchmarkRun[]): Map<string, BenchmarkRun[]> {
  const m = new Map<string, BenchmarkRun[]>();
  for (const r of runs) if (r.architecture === "agentless") m.set(r.instanceId, [...(m.get(r.instanceId) ?? []), r]);
  return m;
}
/** A GT is "found" by a model if ANY of that model's runs matches it (union ceiling). */
function found(runs: BenchmarkRun[], g: GroundTruthIssue, c: SemanticScoreCache): boolean {
  return runs.some((r) => r.producedFindings.some((f) => matched(f, g, c)));
}

const sCache = SemanticScoreCache.fromJSON(load<Record<string, number>>(SONNET_CACHE));
const hCache = SemanticScoreCache.fromJSON(load<Record<string, number>>(HAIKU_CACHE));
const sBI = byInstance(load<BenchmarkRun[]>(SONNET_RUNS));
const hBI = byInstance(load<BenchmarkRun[]>(HAIKU_RUNS));
const insts = [...sBI.keys()].filter((i) => hBI.has(i)).sort();
console.log(`Capability difficulty stratification — Sonnet vs Haiku, agentless, ${insts.length} PRs (union-of-runs "found", τ=${TAU})\n`);

interface Cell { both: number; sonnetOnly: number; haikuOnly: number; neither: number; total: number; }
const cells: Record<Cat, Cell> = {
  rule: { both: 0, sonnetOnly: 0, haikuOnly: 0, neither: 0, total: 0 },
  func: { both: 0, sonnetOnly: 0, haikuOnly: 0, neither: 0, total: 0 },
};
for (const id of insts) {
  const sr = sBI.get(id)!, hr = hBI.get(id)!;
  for (const g of hr[0]!.groundTruth) {
    const h = found(hr, g, hCache), s = found(sr, g, sCache);
    const cell = cells[bucket(g)];
    cell.total += 1;
    if (h && s) cell.both += 1;
    else if (s) cell.sonnetOnly += 1;
    else if (h) cell.haikuOnly += 1;
    else cell.neither += 1;
  }
}

const pct = (a: number, b: number): string => (b > 0 ? `${((a / b) * 100).toFixed(0)}%` : "–");
for (const cat of ["func", "rule"] as Cat[]) {
  const c = cells[cat];
  const haikuMissed = c.sonnetOnly + c.neither;
  console.log(`=== ${cat === "func" ? "FUNCTIONAL bugs" : "RULE violations"} (n=${c.total} golden issues) ===`);
  console.log(`  both found      ${String(c.both).padStart(3)}   Sonnet-only ${String(c.sonnetOnly).padStart(3)}   Haiku-only ${String(c.haikuOnly).padStart(3)}   neither ${String(c.neither).padStart(3)}`);
  console.log(`  Haiku recall (union) = ${pct(c.both + c.haikuOnly, c.total)}   Sonnet recall (union) = ${pct(c.both + c.sonnetOnly, c.total)}`);
  console.log(`  of Haiku's ${haikuMissed} MISSES, Sonnet recovers ${c.sonnetOnly} = ${pct(c.sonnetOnly, haikuMissed)}  (capability's marginal value on the residual)`);
  console.log(`  Sonnet regressions (Haiku found, Sonnet lost) = ${c.haikuOnly} = ${pct(c.haikuOnly, c.both + c.haikuOnly)} of Haiku's finds`);
  console.log(`  hard core (NEITHER model, any run) = ${c.neither} = ${pct(c.neither, c.total)}  → needs grounding/execution, not capability\n`);
}
console.log(`EXPLORATORY (reuses collected data). "found" = matched in ≥1 of the model's runs; the neither-cell is the capability-invariant residual.`);
