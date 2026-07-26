/**
 * Ad-hoc: WHAT functional bugs do Haiku vs Sonnet miss? Same pilot instances,
 * agentless ungrounded. Per functional GT (category empty), "caught" = matched in
 * a majority of that model's 3 runs. Buckets each functional bug into both-catch /
 * Sonnet-only / Haiku-only / both-miss, and prints the miss contents so the
 * shared "hard core" (both miss) and the capability-unlocked set (Sonnet-only)
 * can be characterised. ZERO LLM calls.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { repoOfInstance } from "../src/grounding/project-conventions.ts";

const ROOT = join(import.meta.dirname, "..");
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const REPOS = ["Ghost", "aspnetcore"];
const norm = (p: string): string => (p ?? "").trim().replace(/^\.\//, "");
const isFunc = (g: GroundTruthIssue): boolean => !(g.category && g.category.trim());
const matched = (f: ReviewFinding, g: GroundTruthIssue, c: SemanticScoreCache): boolean =>
  norm(g.file) === norm(f.file) && ((f.line >= g.lineStart && f.line <= g.lineEnd) || (c.get(f, g) ?? 0) >= TAU);

// Haiku: cached confirmatory agentless runs; Sonnet: the ungrounded pilot runs.
const haiku = (JSON.parse(readFileSync(join(ROOT, "phase2-results", "qodo-all-runs.json"), "utf8")) as BenchmarkRun[])
  .filter((r) => r.architecture === "agentless");
const haikuCache = SemanticScoreCache.fromJSON(JSON.parse(readFileSync(join(ROOT, "phase2-results", "qodo-all-cache.json"), "utf8")) as Record<string, number>);
const sonnet: BenchmarkRun[] = [];
const sCacheObj: Record<string, number> = {};
for (const repo of REPOS) {
  const rf = join(ROOT, "grounding-pilot", `sonnet-ung-${repo}-runs.json`);
  const cf = join(ROOT, "grounding-pilot", `sonnet-ung-${repo}-cache.json`);
  if (existsSync(rf)) sonnet.push(...(JSON.parse(readFileSync(rf, "utf8")) as BenchmarkRun[]));
  if (existsSync(cf)) Object.assign(sCacheObj, JSON.parse(readFileSync(cf, "utf8")) as Record<string, number>);
}
const sonnetCache = SemanticScoreCache.fromJSON(sCacheObj);

const byInst = (runs: BenchmarkRun[]): Map<string, BenchmarkRun[]> => {
  const m = new Map<string, BenchmarkRun[]>();
  for (const r of runs) m.set(r.instanceId, [...(m.get(r.instanceId) ?? []), r]);
  return m;
};
const hMap = byInst(haiku);
const sMap = byInst(sonnet);
const pilot = [...sMap.keys()].filter((i) => hMap.has(i)).sort();

const caught = (runs: BenchmarkRun[], g: GroundTruthIssue, c: SemanticScoreCache): boolean => {
  const hits = runs.filter((run) => run.producedFindings.some((f) => matched(f, g, c))).length;
  return hits >= Math.ceil(runs.length / 2); // majority of the 3 runs
};

interface Item { inst: string; g: GroundTruthIssue; }
const bothCatch: Item[] = [], sonnetOnly: Item[] = [], haikuOnly: Item[] = [], bothMiss: Item[] = [];
for (const inst of pilot) {
  const hRuns = hMap.get(inst)!, sRuns = sMap.get(inst)!;
  const gt = hRuns[0]!.groundTruth.filter(isFunc);
  for (const g of gt) {
    const h = caught(hRuns, g, haikuCache), s = caught(sRuns, g, sonnetCache);
    const it = { inst, g };
    if (h && s) bothCatch.push(it); else if (s) sonnetOnly.push(it); else if (h) haikuOnly.push(it); else bothMiss.push(it);
  }
}
const tot = bothCatch.length + sonnetOnly.length + haikuOnly.length + bothMiss.length;
console.log(`Functional-bug GT over ${pilot.length} pilot PRs (agentless ungrounded; caught = majority of 3 runs, semantic τ=${TAU}): ${tot}`);
console.log(`  both catch:   ${bothCatch.length} (${(100*bothCatch.length/tot).toFixed(0)}%)`);
console.log(`  Sonnet only:  ${sonnetOnly.length} (${(100*sonnetOnly.length/tot).toFixed(0)}%)   ← capability unlocks`);
console.log(`  Haiku only:   ${haikuOnly.length} (${(100*haikuOnly.length/tot).toFixed(0)}%)   ← Sonnet regressions`);
console.log(`  BOTH MISS:    ${bothMiss.length} (${(100*bothMiss.length/tot).toFixed(0)}%)   ← the shared hard core`);
const show = (items: Item[], n = 100): void => {
  for (const it of items.slice(0, n)) {
    const g = it.g;
    console.log(`   [${it.inst}] ${norm(g.file)}:${g.lineStart}  "${(g.title ?? "").slice(0, 80)}" — ${((g.description ?? "") as string).slice(0, 90)}`);
  }
};
console.log(`\n=== BOTH MISS (shared hard core) ===`); show(bothMiss);
console.log(`\n=== SONNET-ONLY catches (what capability unlocks) ===`); show(sonnetOnly);
console.log(`\n=== HAIKU-ONLY catches (Sonnet regressions) ===`); show(haikuOnly);
