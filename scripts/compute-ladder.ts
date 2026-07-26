/**
 * Decorrelation / compute-effect ladder (doc-17 amplification). "Spending K calls
 * and unioning" lifts recall ONLY in proportion to how decorrelated the K draws
 * are. Two ladders on the same Qodo PRs, same K=1 anchor (one Haiku run):
 *   homo   union of K Haiku runs at temp 0.7   — same-model (temperature) decorrelation
 *   hetero Haiku + a growing set of model FAMILIES (1 run each) — cross-family decorrelation
 * The homo slope is the same-model ceiling; hetero-over-homo at each K is the
 * family-diversity bonus. With ≥5 families the hetero ladder traces the diversity
 * SATURATION curve (where does adding a family stop helping). ZERO LLM calls.
 *
 * Env:
 *   HAIKU_RUNS/HAIKU_CACHE      anchor (K1 = Haiku run[0]); temp-0 confirmatory.
 *   HAIKU07_RUNS/HAIKU07_CACHE  homo ladder (Haiku @temp 0.7, ≥K runs). Optional.
 *   FAMILIES  csv of "name:runsFile:cacheFile" added in order to the hetero ladder.
 *   SEMANTIC_THRESHOLD (=0.7)
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
const HAIKU_RUNS = P("HAIKU_RUNS", join(rr, "phase2-results", "qodo-all-runs.json"));
const HAIKU_CACHE = P("HAIKU_CACHE", join(rr, "phase2-results", "qodo-all-cache.json"));
const HAIKU07_RUNS = process.env.HAIKU07_RUNS ? resolve(process.env.HAIKU07_RUNS) : undefined;
const HAIKU07_CACHE = process.env.HAIKU07_CACHE ? resolve(process.env.HAIKU07_CACHE) : undefined;
const FAMILIES = (process.env.FAMILIES ??
  `Kimi:${join(rr, "hetero-confirmatory", "hetero-runs-moonshotai.kimi-k2.5.json")}:${join(rr, "hetero-confirmatory", "hetero-cache.json")},` +
  `GLM:${join(rr, "hetero-confirmatory", "hetero-runs-zai.glm-5.json")}:${join(rr, "hetero-confirmatory", "hetero-cache.json")}`)
  .split(",").map((s) => s.trim()).filter(Boolean);
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
interface Member { run: BenchmarkRun; cache: SemanticScoreCache; }
function evalTeam(members: Member[], gt: GroundTruthIssue[]): { rHit: number; rN: number; tp: number; uniq: number } {
  let rHit = 0;
  for (const g of gt) if (members.some((m) => m.run.producedFindings.some((f) => matched(f, g, m.cache)))) rHit += 1;
  const kept: ReviewFinding[] = []; const keptC: SemanticScoreCache[] = [];
  for (const m of members) for (const f of m.run.producedFindings) { if (kept.some((k) => areDuplicateFindings(k, f))) continue; kept.push(f); keptC.push(m.cache); }
  let tp = 0; for (let i = 0; i < kept.length; i += 1) if (gt.some((g) => matched(kept[i]!, g, keptC[i]!))) tp += 1;
  return { rHit, rN: gt.length, tp, uniq: kept.length };
}

// Load anchor + families.
const hC = SemanticScoreCache.fromJSON(load<Record<string, number>>(HAIKU_CACHE));
const H = byInstance(load<BenchmarkRun[]>(HAIKU_RUNS));
interface Fam { name: string; runs: Map<string, BenchmarkRun[]>; cache: SemanticScoreCache; }
const fams: Fam[] = FAMILIES.map((spec) => {
  const [name, runsFile, cacheFile] = spec.split(":");
  return { name: name!, runs: byInstance(load<BenchmarkRun[]>(resolve(runsFile!))), cache: SemanticScoreCache.fromJSON(load<Record<string, number>>(resolve(cacheFile!))) };
});
const H07 = HAIKU07_RUNS ? byInstance(load<BenchmarkRun[]>(HAIKU07_RUNS)) : undefined;
const h07C = HAIKU07_CACHE ? SemanticScoreCache.fromJSON(load<Record<string, number>>(HAIKU07_CACHE)) : hC;

// Instances present in the anchor and EVERY family (so each ladder rung is on the same set).
let insts = [...H.keys()].filter((i) => (H.get(i)?.length ?? 0) >= 1);
for (const f of fams) insts = insts.filter((i) => f.runs.has(i));
insts = insts.sort();
console.log(`Decorrelation ladder — ${insts.length} Qodo PRs; families in order: Haiku, ${fams.map((f) => f.name).join(", ")} (semantic τ=${TAU})\n`);

function rate(pairs: { rHit: number; rN: number; tp: number; uniq: number }[]): { R: number; Pr: number; U: number } {
  let rHit = 0, rN = 0, tp = 0, uniq = 0;
  for (const a of pairs) { rHit += a.rHit; rN += a.rN; tp += a.tp; uniq += a.uniq; }
  return { R: rN ? rHit / rN : 0, Pr: uniq ? tp / uniq : 0, U: uniq / (pairs.length || 1) };
}

// hetero ladder: K=1 Haiku; K=k adds families[0..k-2].
console.log("=== HETERO ladder (Haiku + families, 1 run each) ===");
const heteroR: number[] = [];
for (let k = 1; k <= fams.length + 1; k += 1) {
  const cells = insts.map((i) => {
    const members: Member[] = [{ run: H.get(i)![0]!, cache: hC }];
    for (let j = 0; j < k - 1; j += 1) members.push({ run: fams[j]!.runs.get(i)![0]!, cache: fams[j]!.cache });
    return evalTeam(members, H.get(i)![0]!.groundTruth);
  });
  const { R, Pr, U } = rate(cells);
  heteroR.push(R);
  const added = k === 1 ? "Haiku" : `+${fams[k - 2]!.name}`;
  const marg = k === 1 ? "" : `  (Δ +${((R - heteroR[k - 2]!) * 100).toFixed(1)}pp)`;
  console.log(`  K=${k} ${added.padEnd(10)} recall ${(R * 100).toFixed(0)}%  prec ${(Pr * 100).toFixed(0)}%  findings/PR ${U.toFixed(1)}${marg}`);
}

// homo ladder: Haiku@0.7 union of K runs.
if (H07) {
  console.log("\n=== HOMO ladder (Haiku @temp 0.7, K runs) ===");
  const maxK = Math.max(...insts.map((i) => H07.get(i)?.length ?? 0));
  const homoR: number[] = [];
  for (let k = 1; k <= Math.min(maxK, fams.length + 1); k += 1) {
    const cells = insts.map((i) => evalTeam((H07.get(i) ?? []).slice(0, k).map((run) => ({ run, cache: h07C })), H.get(i)![0]!.groundTruth));
    const { R, Pr, U } = rate(cells);
    homoR.push(R);
    const marg = k === 1 ? "" : `  (Δ +${((R - homoR[k - 2]!) * 100).toFixed(1)}pp)`;
    console.log(`  K=${k}            recall ${(R * 100).toFixed(0)}%  prec ${(Pr * 100).toFixed(0)}%  findings/PR ${U.toFixed(1)}${marg}`);
    if (k <= heteroR.length) console.log(`       diversity bonus @K=${k}: +${((heteroR[k - 1]! - R) * 100).toFixed(1)}pp`);
  }
}
console.log(`\nEXPLORATORY. Union recall = golden issue found by ANY member. Hetero adds a NEW model family per rung (family order affects per-step marginals, not the K=max total). Diversity bonus = hetero − homo at equal K (equal calls).`);
