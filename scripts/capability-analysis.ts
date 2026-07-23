/**
 * Capability × defect-type confirmatory analysis (doc 14). Pairs the Sonnet 4.5
 * agentless-ungrounded arm against the frozen Haiku 4.5 agentless-ungrounded
 * confirmatory arm on the SAME 80-PR remainder, split by ground-truth defect type
 * (rule = GT `category` present; functional = absent). Δ = Sonnet − Haiku.
 *
 *   H-cap-interaction (PRIMARY): DiD = Δrecall_func − Δrecall_rule > 0
 *       — micro-pooled rate gap, whole-PR bootstrap CI + one-sided bootstrap p.
 *   H-cap-func (secondary):      Δrecall_func > 0 — paired Wilcoxon (one-sided),
 *       matched-pairs rank-biserial + Cliff's δ, paired bootstrap CI of the mean.
 *   H-cap-rule (secondary, EQUIVALENCE): |Δrecall_rule| within ±0.06 SESOI — paired
 *       TOST (normal approx) + realized MDE at N.
 *   Guardrail: per-model agentless precision (a func gain must not be verbosity).
 *   Multiplicity: Holm–Bonferroni within {DiD, func, rule-equiv}.
 *
 * ZERO LLM calls — replays the two persisted run/cache pairs.
 *
 * Env: SONNET_RUNS, SONNET_CACHE (capability-arm/sonnet-agentless-{runs,cache}.json),
 *      HAIKU_RUNS, HAIKU_CACHE (phase2-results/qodo-all-{runs,cache}.json),
 *      ARM (=agentless), SESOI (=0.06), SEMANTIC_THRESHOLD (=0.7),
 *      BOOT_ITERS (=2000), SEED (=20260722).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import {
  wilcoxonSignedRank,
  cliffsDelta,
  bootstrapPairedCI,
  holmBonferroni,
  normalCdf,
  mean,
} from "../src/analysis/stats.ts";

// Each path env accepts a comma-separated LIST (files are concatenated / caches
// merged) — used by the repo-decomposition re-analysis (doc-14 §confirmatory)
// to point the Sonnet slot at the two per-repo pilot files at once.
const SONNET_RUNS = process.env.SONNET_RUNS ?? "capability-arm/sonnet-agentless-runs.json";
const SONNET_CACHE = process.env.SONNET_CACHE ?? "capability-arm/sonnet-agentless-cache.json";
const HAIKU_RUNS = process.env.HAIKU_RUNS ?? join(import.meta.dirname, "..", "phase2-results", "qodo-all-runs.json");
const HAIKU_CACHE = process.env.HAIKU_CACHE ?? join(import.meta.dirname, "..", "phase2-results", "qodo-all-cache.json");
const ARM = process.env.ARM ?? "agentless";
const SESOI = Number(process.env.SESOI ?? 0.06);
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const BOOT = Math.max(200, Number(process.env.BOOT_ITERS ?? 2000));
const SEED = Number(process.env.SEED ?? 20260722);

type Cat = "rule" | "func";
const normPath = (p: string): string => p.trim().replace(/^\.\//, "");
const bucket = (g: GroundTruthIssue): Cat => (g.category && g.category.trim() ? "rule" : "func");

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const paths = (list: string): string[] => list.split(",").map((s) => s.trim()).filter(Boolean).map((p) => resolve(p));
function loadRuns(list: string): BenchmarkRun[] {
  const out: BenchmarkRun[] = [];
  for (const p of paths(list)) {
    if (!existsSync(p)) { console.error(`missing runs file: ${p}`); process.exit(1); }
    out.push(...(JSON.parse(readFileSync(p, "utf8")) as BenchmarkRun[]));
  }
  return out;
}
function loadCache(list: string): SemanticScoreCache {
  const obj: Record<string, number> = {};
  for (const p of paths(list)) {
    if (!existsSync(p)) { console.error(`missing cache file: ${p}`); process.exit(1); }
    Object.assign(obj, JSON.parse(readFileSync(p, "utf8")) as Record<string, number>);
  }
  return SemanticScoreCache.fromJSON(obj);
}
function matched(f: ReviewFinding, g: GroundTruthIssue, cache: SemanticScoreCache): boolean {
  return normPath(g.file) === normPath(f.file) &&
    ((f.line >= g.lineStart && f.line <= g.lineEnd) || (cache.get(f, g) ?? 0) >= TAU);
}

/** Per-PR, one model+arm: sum over that PR's runs of matched/total GT per type, plus precision. */
interface PRCounts { ruleHit: number; ruleN: number; funcHit: number; funcN: number; tpFindings: number; findings: number; nRuns: number; }
function perPR(runs: BenchmarkRun[], cache: SemanticScoreCache): Map<string, PRCounts> {
  const m = new Map<string, PRCounts>();
  for (const r of runs) {
    if (r.architecture !== ARM) continue;
    const c = m.get(r.instanceId) ?? { ruleHit: 0, ruleN: 0, funcHit: 0, funcN: 0, tpFindings: 0, findings: 0, nRuns: 0 };
    for (const g of r.groundTruth) {
      const hit = r.producedFindings.some((f) => matched(f, g, cache));
      if (bucket(g) === "rule") { c.ruleN += 1; if (hit) c.ruleHit += 1; }
      else { c.funcN += 1; if (hit) c.funcHit += 1; }
    }
    for (const f of r.producedFindings) {
      c.findings += 1;
      if (r.groundTruth.some((g) => matched(f, g, cache))) c.tpFindings += 1;
    }
    c.nRuns += 1;
    m.set(r.instanceId, c);
  }
  return m;
}

const rate = (hit: number, n: number): number => (n > 0 ? hit / n : 0);

const sRuns = loadRuns(SONNET_RUNS), sCache = loadCache(SONNET_CACHE);
const hRuns = loadRuns(HAIKU_RUNS), hCache = loadCache(HAIKU_CACHE);
const sPR = perPR(sRuns, sCache), hPR = perPR(hRuns, hCache);
const insts = [...sPR.keys()].filter((i) => hPR.has(i)).sort();
if (insts.length === 0) { console.error("no paired instances between Sonnet and Haiku agentless runs"); process.exit(1); }
console.log(`Capability × defect-type — Sonnet vs Haiku, arm=${ARM}, ${insts.length} paired PRs (semantic τ=${TAU})\n`);
const instSet = new Set(insts);
const armCount = (rs: BenchmarkRun[]): number => rs.filter((r) => r.architecture === ARM && instSet.has(r.instanceId)).length;
console.log(`  Sonnet runs=${armCount(sRuns)}  Haiku runs=${armCount(hRuns)} (over the ${insts.length} paired PRs)`);

// ---- per-PR paired recall by type (mean over runs; = summed hits / summed N) ----
interface Unit { id: string; sFunc: number; hFunc: number; funcN: number; sRule: number; hRule: number; ruleN: number; sHit: PRCounts; hHit: PRCounts; }
const units: Unit[] = insts.map((id) => {
  const s = sPR.get(id)!, h = hPR.get(id)!;
  return {
    id,
    sFunc: rate(s.funcHit, s.funcN), hFunc: rate(h.funcHit, h.funcN), funcN: s.funcN / Math.max(1, s.nRuns),
    sRule: rate(s.ruleHit, s.ruleN), hRule: rate(h.ruleHit, h.ruleN), ruleN: s.ruleN / Math.max(1, s.nRuns),
    sHit: s, hHit: h,
  };
});

const funcUnits = units.filter((u) => u.funcN > 0);
const ruleUnits = units.filter((u) => u.ruleN > 0);
console.log(`  PRs with functional GT: ${funcUnits.length}   PRs with rule GT: ${ruleUnits.length}\n`);

// ---- H-cap-func (secondary): Δrecall_func > 0 (paired, one-sided) ----
const sFuncArr = funcUnits.map((u) => u.sFunc), hFuncArr = funcUnits.map((u) => u.hFunc);
const dFunc = funcUnits.map((u) => u.sFunc - u.hFunc);
const wFunc = wilcoxonSignedRank(dFunc);
const pFuncOneSided = mean(dFunc) > 0 ? wFunc.p / 2 : 1 - wFunc.p / 2;
const rbFunc = rankBiserial(dFunc);
const funcCI = bootstrapPairedCI(sFuncArr, hFuncArr, (a, b) => mean(a) - mean(b), { iters: BOOT, seed: SEED });
const cliffFunc = cliffsDelta(sFuncArr, hFuncArr);

// ---- H-cap-rule (secondary, EQUIVALENCE): |Δrecall_rule| within ±SESOI (TOST) ----
const dRule = ruleUnits.map((u) => u.sRule - u.hRule);
const tost = tostPaired(dRule, SESOI);
const mde = mdePaired(dRule);
const ruleCI = bootstrapPairedCI(ruleUnits.map((u) => u.sRule), ruleUnits.map((u) => u.hRule), (a, b) => mean(a) - mean(b), { iters: BOOT, seed: SEED });

// ---- H-cap-interaction (PRIMARY): DiD = Δfunc − Δrule, micro-pooled, whole-PR bootstrap ----
function didOf(us: Unit[]): { dFunc: number; dRule: number; did: number; sFuncR: number; hFuncR: number; sRuleR: number; hRuleR: number } {
  let sfh = 0, hfh = 0, fn = 0, srh = 0, hrh = 0, rn = 0;
  for (const u of us) {
    sfh += u.sHit.funcHit; hfh += u.hHit.funcHit; fn += u.sHit.funcN;
    srh += u.sHit.ruleHit; hrh += u.hHit.ruleHit; rn += u.sHit.ruleN;
  }
  const sFuncR = rate(sfh, fn), hFuncR = rate(hfh, fn), sRuleR = rate(srh, rn), hRuleR = rate(hrh, rn);
  const dF = sFuncR - hFuncR, dR = sRuleR - hRuleR;
  return { dFunc: dF, dRule: dR, did: dF - dR, sFuncR, hFuncR, sRuleR, hRuleR };
}
const point = didOf(units);
const rng = mulberry32(SEED);
const didSamples: number[] = [];
for (let b = 0; b < BOOT; b += 1) {
  const rs = Array.from({ length: units.length }, () => units[Math.floor(rng() * units.length)]!);
  didSamples.push(didOf(rs).did);
}
didSamples.sort((a, b) => a - b);
const didLo = didSamples[Math.floor(0.025 * BOOT)]!;
const didHi = didSamples[Math.min(BOOT - 1, Math.ceil(0.975 * BOOT) - 1)]!;
const pDidOneSided = didSamples.filter((d) => d <= 0).length / BOOT; // H1: DiD>0

// ---- Guardrail: per-model precision (agentless) ----
const sPrec = mean(units.map((u) => rate(u.sHit.tpFindings, u.sHit.findings)));
const hPrec = mean(units.map((u) => rate(u.hHit.tpFindings, u.hHit.findings)));

// ---- Holm across the confirmatory family ----
const holm = holmBonferroni([pDidOneSided, pFuncOneSided, tost.p]);

console.log(`=== H-cap-interaction (PRIMARY) — DiD = Δfunc − Δrule (micro-pooled, Δ=Sonnet−Haiku) ===`);
console.log(`  func recall: Haiku ${(point.hFuncR * 100).toFixed(0)}% → Sonnet ${(point.sFuncR * 100).toFixed(0)}%   Δfunc=${(point.dFunc * 100).toFixed(1)}pp`);
console.log(`  rule recall: Haiku ${(point.hRuleR * 100).toFixed(0)}% → Sonnet ${(point.sRuleR * 100).toFixed(0)}%   Δrule=${(point.dRule * 100).toFixed(1)}pp`);
console.log(`  DiD = ${(point.did * 100).toFixed(1)}pp   95% CI[${(didLo * 100).toFixed(1)}, ${(didHi * 100).toFixed(1)}]   one-sided bootstrap p=${pDidOneSided.toFixed(4)}  ${didLo > 0 ? "→ interaction: capability buys FUNC not RULE" : "→ not separable at this N"}`);

console.log(`\n=== H-cap-func (secondary) — Δrecall_func > 0 (paired, one-sided) ===`);
console.log(`  mean Δfunc=${(mean(dFunc) * 100).toFixed(1)}pp   95% CI[${(funcCI.lo * 100).toFixed(1)}, ${(funcCI.hi * 100).toFixed(1)}]`);
console.log(`  Wilcoxon z=${wFunc.z.toFixed(2)} one-sided p=${pFuncOneSided.toFixed(4)} (n=${wFunc.n})   rank-biserial=${rbFunc.toFixed(2)}   Cliff's δ=${cliffFunc.toFixed(2)}`);

console.log(`\n=== H-cap-rule (secondary, EQUIVALENCE) — |Δrecall_rule| within ±${(SESOI * 100).toFixed(0)}pp (TOST) ===`);
console.log(`  mean Δrule=${(mean(dRule) * 100).toFixed(1)}pp   95% CI[${(ruleCI.lo * 100).toFixed(1)}, ${(ruleCI.hi * 100).toFixed(1)}]   (n=${dRule.length})`);
console.log(`  TOST: p_lower=${tost.pLower.toFixed(4)} p_upper=${tost.pUpper.toFixed(4)} → equivalence p=${tost.p.toFixed(4)}  ${tost.p < 0.05 ? "→ EQUIVALENT (Δrule immaterial)" : "→ not declared equivalent at this N"}`);
console.log(`  realized MDE at N=${dRule.length} (α=.05, power .80) = ±${(mde * 100).toFixed(1)}pp`);

console.log(`\n=== Guardrail — agentless precision (macro) ===`);
console.log(`  Haiku P=${(hPrec * 100).toFixed(0)}%   Sonnet P=${(sPrec * 100).toFixed(0)}%   ${sPrec >= hPrec - 0.03 ? "→ func gain is not a verbosity artifact" : "→ CAUTION: precision dropped, inspect verbosity"}`);

console.log(`\n=== Holm–Bonferroni (family {DiD, func, rule-equiv}) ===`);
console.log(`  DiD:        raw p=${pDidOneSided.toFixed(4)}  Holm p=${holm[0]!.toFixed(4)}`);
console.log(`  Δfunc>0:    raw p=${pFuncOneSided.toFixed(4)}  Holm p=${holm[1]!.toFixed(4)}`);
console.log(`  rule-equiv: raw p=${tost.p.toFixed(4)}  Holm p=${holm[2]!.toFixed(4)}`);
console.log(`\nConfirmatory (OSF 2z4vj, capability amendment doc-14). Replays persisted runs + judge caches; zero LLM calls. Δ = Sonnet − Haiku on the frozen agentless-ungrounded arm.`);

// ---- inline helpers (would live in src/analysis/stats.ts; kept local to avoid PR#41 merge conflict) ----
/** Matched-pairs rank-biserial from signed-rank: r = 4·W+/(n(n+1)) − 1, range [−1,1]. */
function rankBiserial(diffs: readonly number[]): number {
  const w = wilcoxonSignedRank(diffs);
  if (w.n === 0) return 0;
  return (4 * w.wPlus) / (w.n * (w.n + 1)) - 1;
}
/** Paired TOST against ±delta (normal approx). Equivalence if max(pLower,pUpper) < α. */
function tostPaired(diffs: readonly number[], delta: number): { pLower: number; pUpper: number; p: number } {
  const n = diffs.length;
  if (n < 2) return { pLower: 1, pUpper: 1, p: 1 };
  const m = mean(diffs);
  const sd = Math.sqrt(diffs.reduce((a, d) => a + (d - m) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  if (se === 0) return { pLower: Math.abs(m) < delta ? 0 : 1, pUpper: Math.abs(m) < delta ? 0 : 1, p: Math.abs(m) < delta ? 0 : 1 };
  const pLower = 1 - normalCdf((m - -delta) / se); // H0: μ ≤ −δ
  const pUpper = normalCdf((m - delta) / se);       // H0: μ ≥ +δ
  return { pLower, pUpper, p: Math.max(pLower, pUpper) };
}
/** Realized two-sided MDE (α=.05, power .80) for a paired mean: (z.975+z.80)·sd/√n. */
function mdePaired(diffs: readonly number[]): number {
  const n = diffs.length;
  if (n < 2) return Infinity;
  const m = mean(diffs);
  const sd = Math.sqrt(diffs.reduce((a, d) => a + (d - m) ** 2, 0) / (n - 1));
  return (1.959964 + 0.841621) * (sd / Math.sqrt(n));
}
