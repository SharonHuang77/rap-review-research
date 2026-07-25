/**
 * Build cross-family distillation SFT data (necessity probe; zero-LLM).
 *
 * doc-18 + doc-17 §8: a single model tops out ~65–68% recall; the 7-family UNION
 * reaches ~83%. The probe: can a single model LEARN the union's coverage via SFT, or
 * is the cross-family advantage IRREDUCIBLE (needs independent models at inference)?
 *   distillable  ⇒ multi-agent is a training scaffold (reframes deployment)
 *   not-distillable ⇒ multi-agent is NECESSARY at inference (pro-multi-agent result)
 * Both outcomes are informative and consistent with the decorrelation thesis.
 *
 * This assembles the SFT target set from ALREADY-CACHED data (no LLM): per PR, the
 * dedup union of the 7 families' TRUE-POSITIVE findings (each matched to GT via that
 * family's own judge cache) = the "ideal review" the union got right. Writes
 * (diff → winning-review-JSON) pairs with a deterministic train/test split so the
 * fine-tune can be evaluated on HELD-OUT PRs (does single-model recall move toward the
 * union ceiling on unseen diffs?). COVERAGE-focused: targets are TPs only (precision is
 * not the probe's question). Qodo-only, so data is THIN — a null could be data-starved.
 *
 * Env: SEMANTIC_THRESHOLD (=0.7), TEST_EVERY (=3 → ~⅓ held out), OUT_DIR (=module-arm).
 * Run: node scripts/build-distill-winners.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

import { BenchmarkLoader } from "../src/campaign/index.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { areDuplicateFindings } from "../src/architectures/shared/finding-dedup.ts";

const rr = join(import.meta.dirname, "..");
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const TEST_EVERY = Math.max(2, Number(process.env.TEST_EVERY ?? 3));
const OUT = process.env.OUT_DIR ?? join(rr, "module-arm");
const p = (...s: string[]): string => join(rr, ...s);

// 7 distinct pretraining families on Qodo (name, runs, cache) — from §8.
const FAMILIES: readonly [string, string, string][] = [
  ["haiku", p("hetero-confirmatory", "ladder-haiku07-runs.json"), p("hetero-confirmatory", "ladder-haiku07-cache.json")],
  ["kimi", p("hetero-confirmatory", "hetero-runs-moonshotai.kimi-k2.5.json"), p("hetero-confirmatory", "hetero-cache.json")],
  ["glm", p("hetero-confirmatory", "hetero-runs-zai.glm-5.json"), p("hetero-confirmatory", "hetero-cache.json")],
  ["deepseek", p("hetero-confirmatory", "ladder-deepseek-runs.json"), p("hetero-confirmatory", "ladder-deepseek-cache.json")],
  ["nova", p("hetero-confirmatory", "ladder-nova-runs.json"), p("hetero-confirmatory", "ladder-nova-cache.json")],
  ["llama4", p("hetero-confirmatory", "ladder-llama4-runs.json"), p("hetero-confirmatory", "ladder-llama4-cache.json")],
  ["palmyra", p("hetero-confirmatory", "ladder-palmyra-runs.json"), p("hetero-confirmatory", "ladder-palmyra-cache.json")],
];

const load = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const normPath = (s: string): string => s.trim().replace(/^\.\//, "");
const matched = (f: ReviewFinding, g: GroundTruthIssue, c: SemanticScoreCache): boolean =>
  normPath(g.file) === normPath(f.file) && ((f.line >= g.lineStart && f.line <= g.lineEnd) || (c.get(f, g) ?? 0) >= TAU);

const cacheMemo = new Map<string, SemanticScoreCache>();
const loadCache = (path: string): SemanticScoreCache => { if (!cacheMemo.has(path)) cacheMemo.set(path, SemanticScoreCache.fromJSON(load<Record<string, number>>(path))); return cacheMemo.get(path)!; };

// per-family per-instance findings + cache
interface Fam { name: string; byInst: Map<string, ReviewFinding[]>; cache: SemanticScoreCache }
const gtByInst = new Map<string, GroundTruthIssue[]>();
const fams: Fam[] = [];
for (const [name, runsPath, cachePath] of FAMILIES) {
  if (!existsSync(runsPath) || !existsSync(cachePath)) { console.log(`(skip ${name}: missing)`); continue; }
  const runs = load<BenchmarkRun[]>(runsPath).filter((r) => r.architecture === "agentless");
  const g = new Map<string, ReviewFinding[]>();
  for (const r of runs) { g.set(r.instanceId, [...(g.get(r.instanceId) ?? []), ...r.producedFindings]); if (!gtByInst.has(r.instanceId)) gtByInst.set(r.instanceId, r.groundTruth); }
  fams.push({ name, byInst: g, cache: loadCache(cachePath) });
}

// diffs from qodo.json (authoritative)
const qodo = new BenchmarkLoader().loadQodo(load(join(resolve(process.env.BENCHMARK_DATA_DIR ?? join(rr, "data", "benchmark")), "qodo.json")));
const diffOf = new Map<string, string>(qodo.instances.map((i) => [i.instanceId, i.rawDiff]));

// common instance set across all families
let insts = [...fams[0]!.byInst.keys()];
for (const f of fams) insts = insts.filter((i) => f.byInst.has(i));
insts = insts.filter((i) => (gtByInst.get(i)?.length ?? 0) > 0 && diffOf.has(i)).sort();

/**
 * Per PR: the union's COVERAGE as a clean review — for each GT issue that ANY family
 * caught, one representative real finding (real review style, ≤ |GT|/PR). This is the
 * "ideal review" target: which true issues the union reached, once each — not 7×
 * redundant rephrasings.
 */
function unionCoverageReview(inst: string): ReviewFinding[] {
  const gt = gtByInst.get(inst)!;
  const out: ReviewFinding[] = [];
  for (const g of gt) {
    let rep: ReviewFinding | undefined;
    for (const fam of fams) { const hit = (fam.byInst.get(inst) ?? []).find((f) => matched(f, g, fam.cache)); if (hit) { rep = hit; break; } }
    if (rep && !out.some((k) => areDuplicateFindings(k, rep!))) out.push(rep);
  }
  return out;
}
const slimReview = (fs: ReviewFinding[]): string =>
  JSON.stringify(fs.map((f) => ({ file: f.file, line: f.line, title: f.title, description: f.description })));

mkdirSync(OUT, { recursive: true });
const trainRows: string[] = []; const testIds: string[] = [];
let trainWinners = 0, testWinners = 0, gtTotal = 0;
insts.forEach((inst, idx) => {
  const winners = unionCoverageReview(inst);
  gtTotal += gtByInst.get(inst)!.length;
  if (idx % TEST_EVERY === 0) { testIds.push(inst); testWinners += winners.length; return; } // held out
  trainWinners += winners.length;
  trainRows.push(JSON.stringify({ instanceId: inst, diff: diffOf.get(inst)!, review: slimReview(winners) }));
});
writeFileSync(join(OUT, "winners-train.jsonl"), trainRows.join("\n") + "\n");
writeFileSync(join(OUT, "distill-test-ids.json"), JSON.stringify(testIds, null, 2));

const nTrain = trainRows.length, nTest = testIds.length;
console.log(`Cross-family distillation data — ${fams.length} families, ${insts.length} common Qodo PRs (τ=${TAU}).`);
console.log(`  train: ${nTrain} PRs, ${trainWinners} union-TP winners (mean ${(trainWinners / (nTrain || 1)).toFixed(1)}/PR)`);
console.log(`  test:  ${nTest} PRs (held out), ${testWinners} winners`);
console.log(`  wrote ${join(OUT, "winners-train.jsonl")} + ${join(OUT, "distill-test-ids.json")}`);
console.log(`\nHONEST DATA CHECK: ${nTrain} training diffs is THIN for teaching new coverage (LIMA-scale is ~1k).`);
console.log(`Read a positive (single-model recall on the ${nTest} held-out PRs moves base → toward the union ceiling)`);
console.log(`as "distillable"; a null is AMBIGUOUS here (could be data-starved, not irreducible). Pipeline is reusable`);
console.log(`if more cross-family data is generated later. Train locally (5060 QLoRA); eval on the held-out ids via the harness.`);
