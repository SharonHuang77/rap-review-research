// Pure composition of the E3 report from persisted runs + judge cache. Zero I/O.
import type { IndustrialRun, JudgeCache, IndustrialReport, ArchitectureArm } from "./models.ts";
import { ARCHITECTURE_ARMS, FAMILY_ARMS } from "./models.ts";
import { judgeKey } from "./models.ts";
import { buildPool, poolCoverage } from "./finding-pool.ts";
import { proxyPrecision, proxyF1 } from "./proxy-metrics.ts";
import { judgeGenuineByDepth, type DepthRow } from "./agreement-depth.ts";
import { wilcoxonSignedRank, cliffsDelta, bootstrapPairedCI, mean, median } from "../analysis/stats.ts";
import type { FindingPairScoreCache } from "../benchmark/matching/finding-pair-judge.ts";
import type { ReviewFinding } from "../models/finding.ts";
import type { FindingVerdict, StaticAnalysisFinding, ChangedRange } from "../evaluation/industrial/models.ts";

interface Options {
  primaryJudge?: string;
  staticByPr?: Record<string, StaticAnalysisFinding[]>;
  laterFixByPr?: Record<string, ChangedRange[]>;
}

type Verdicts = Record<string, FindingVerdict>;

const verdictsFor = (judge: JudgeCache, model: string): Verdicts => {
  const out: Verdicts = {};
  const suffix = `::${model}`;
  for (const [k, v] of Object.entries(judge)) if (k.endsWith(suffix)) out[k.slice(0, -suffix.length)] = v;
  return out;
};
// union of a run-group's findings deduped is handled by buildPool clustering; here we just concat.
const concat = (runs: IndustrialRun[]): ReviewFinding[] => runs.flatMap((r) => r.findings);

const HAIKU_FAMILY = FAMILY_ARMS[0];

export function buildIndustrialReport(runs: IndustrialRun[], judge: JudgeCache, pairCache: FindingPairScoreCache, opts: Options = {}): IndustrialReport {
  const primaryJudge = opts.primaryJudge ?? "us.amazon.nova-pro-v1:0";
  const verdicts = verdictsFor(judge, primaryJudge);
  const prs = [...new Set(runs.map((r) => r.pr))].sort();

  // family findings per (pr, family) → for pool + depth
  const familyRunsByPr = (pr: string): Map<string, ReviewFinding[]> => {
    const m = new Map<string, ReviewFinding[]>();
    for (const fam of FAMILY_ARMS) m.set(fam, concat(runs.filter((r) => r.pr === pr && r.axis === "family" && r.arm === fam)));
    return m;
  };

  // per-arm proxy metrics: precision (judge-genuine) + recall (leave-one-out pool coverage), macro over PRs
  const perArm = ARCHITECTURE_ARMS.map((arm: ArchitectureArm) => {
    const precs: number[] = []; const recalls: number[] = []; const f1s: number[] = [];
    for (const pr of prs) {
      const armFindings = concat(runs.filter((r) => r.pr === pr && r.axis === "architecture" && r.arm === arm));
      if (armFindings.length === 0 && armFinderMissing(runs, pr, arm)) continue;
      // leave-one-out: exclude the Haiku family for ALL Haiku arms (Comparability Contract) → every arm scored vs the same {Kimi,GLM} pool
      const pool = buildPool(familyRunsByPr(pr), pairCache, { minSources: 2, excludeSource: HAIKU_FAMILY });
      const p = proxyPrecision(armFindings, verdicts);
      const r = poolCoverage(armFindings, pool, pairCache);
      precs.push(p); recalls.push(r); f1s.push(proxyF1(p, r));
    }
    return { arm, n: precs.length, precision: round(mean(precs)), recall: round(mean(recalls)), f1: round(mean(f1s)) };
  });

  // paired ladder contrasts on proxy-f1 (agentless vs generalists-3, generalists-3 vs hierarchical, hierarchical vs consensus)
  const ladder = pairedLadder(runs, verdicts, prs, familyRunsByPr, pairCache);

  // cross-family depth table (aggregate across PRs): hetero = all-family clusters; homo = Haiku self-recurrence across runs
  const hetero = aggregateDepth(prs.map((pr) => judgeGenuineByDepth(familyRunsByPr(pr), verdicts, pairCache)));
  const homo = aggregateDepth(prs.map((pr) => {
    const haikuRuns = runs.filter((r) => r.pr === pr && r.axis === "family" && r.arm === HAIKU_FAMILY);
    const byRun = new Map<string, ReviewFinding[]>(haikuRuns.map((r) => [`run${r.runIndex}`, r.findings]));
    return judgeGenuineByDepth(byRun, verdicts, pairCache); // depth here = # of Haiku runs agreeing
  }));

  // best-effort triangulation (only when the producer script supplied inputs)
  const staticByDepth = opts.staticByPr
    ? aggregateDepth(prs.map((pr) => corroborationDepth(familyRunsByPr(pr), pairCache, (fnd) => staticHit(fnd, opts.staticByPr![pr] ?? []))))
    : [];
  const laterFixByDepth = opts.laterFixByPr
    ? aggregateDepth(prs.map((pr) => corroborationDepth(familyRunsByPr(pr), pairCache, (fnd) => rangeHit(fnd, opts.laterFixByPr![pr] ?? []))))
    : [];

  const judges = [...new Set(Object.keys(judge).map((k) => k.split("::")[1]!))];
  const judgeKappa = judges.length >= 2 ? cohenKappa(judge, judges[0]!, judges[1]!) : null;

  const cost = ARCHITECTURE_ARMS.map((arm) => {
    const rs = runs.filter((r) => r.axis === "architecture" && r.arm === arm);
    const s = (pick: (c: IndustrialRun["cost"]) => number): number => mean(rs.map((r) => pick(r.cost)));
    return { arm, llmCalls: round(s((c) => c.llmCalls)), messageCount: round(s((c) => c.messageCount)), latencyMs: round(s((c) => c.latencyMs)), estimatedCostUsd: round(s((c) => c.estimatedCostUsd), 4) };
  });

  return {
    meta: {
      prs,
      runsPerArm: maxRunIndex(runs) + 1,
      families: [...FAMILY_ARMS],
      judges,
      primary: "depth",
      secondary: "perArm+ladder",
      note: "Proxy metrics — no human ground truth. PRIMARY=cross-family judge-genuine-by-depth (E1 §4 replication). SECONDARY (proxy, wide CI on ~30 PRs)=per-arm P/R/F1 + ladder; precision=judge-genuine, recall=leave-one-out family-pool coverage.",
    },
    perArm, ladder, depth: { hetero, homo }, triangulation: { staticByDepth, laterFixByDepth }, judgeKappa, cost,
  };
}

function armFinderMissing(runs: IndustrialRun[], pr: string, arm: string): boolean {
  return !runs.some((r) => r.pr === pr && r.axis === "architecture" && r.arm === arm);
}
function aggregateDepth(perPr: DepthRow[][]): Array<{ depth: number; genuine: number; total: number }> {
  const acc = new Map<number, { depth: number; genuine: number; total: number }>();
  for (const table of perPr) for (const row of table) {
    const a = acc.get(row.depth) ?? { depth: row.depth, genuine: 0, total: 0 };
    a.genuine += row.genuine; a.total += row.total; acc.set(row.depth, a);
  }
  return [...acc.values()].sort((x, y) => x.depth - y.depth);
}
function pairedLadder(runs: IndustrialRun[], verdicts: Verdicts, prs: string[], familyRunsByPr: (pr: string) => Map<string, ReviewFinding[]>, pairCache: FindingPairScoreCache): unknown[] {
  const f1ByArmPr = (arm: ArchitectureArm, pr: string): number => {
    const armF = runs.filter((r) => r.pr === pr && r.axis === "architecture" && r.arm === arm).flatMap((r) => r.findings);
    const pool = buildPool(familyRunsByPr(pr), pairCache, { minSources: 2, excludeSource: HAIKU_FAMILY }); // LOO: exclude Haiku family for all arms (Comparability Contract)
    return proxyF1(proxyPrecision(armF, verdicts), poolCoverage(armF, pool, pairCache));
  };
  const pairs: Array<[ArchitectureArm, ArchitectureArm]> = [["agentless", "generalists-3"], ["generalists-3", "hierarchical"], ["hierarchical", "consensus"]];
  return pairs.map(([x, y]) => {
    const xs = prs.map((pr) => f1ByArmPr(x, pr));
    const ys = prs.map((pr) => f1ByArmPr(y, pr));
    const diffs = xs.map((v, i) => v - ys[i]!);
    const ci = bootstrapPairedCI(xs, ys, (a, b) => median(a.map((v, i) => v - b[i]!)), { iters: 2000, seed: 20260719 });
    return { label: `${x} vs ${y}`, metric: "proxy-f1", armX: x, armY: y, n: xs.length, meanX: round(mean(xs)), meanY: round(mean(ys)), medianDiff: round(ci.point), diffLo: round(ci.lo), diffHi: round(ci.hi), wilcoxonP: wilcoxonSignedRank(diffs).p, cliff: round(cliffsDelta(xs, ys)) };
  });
}
function cohenKappa(judge: JudgeCache, a: string, b: string): number {
  const ids = new Set(Object.keys(judge).filter((k) => k.endsWith(`::${a}`)).map((k) => k.split("::")[0]!));
  const pairs: Array<[string, string]> = [];
  for (const id of ids) { const va = judge[judgeKey(id, a)]; const vb = judge[judgeKey(id, b)]; if (va && vb) pairs.push([va, vb]); }
  if (pairs.length === 0) return 0;
  const agree = pairs.filter(([x, y]) => x === y).length / pairs.length;
  const cats = ["valid", "invalid", "uncertain"] as const;
  const pe = cats.reduce((s, c) => s + (frac(pairs, 0, c) * frac(pairs, 1, c)), 0);
  return pe >= 1 ? 1 : (agree - pe) / (1 - pe);
}

// --- triangulation helpers (Task 7): treat "static flags this cluster" / "a later change
// overlaps this cluster" as depth-bucketed genuine signals, reusing the corroboration bucketing. ---
function corroborationDepth(familyFindings: ReadonlyMap<string, ReviewFinding[]>, cache: FindingPairScoreCache, hit: (f: ReviewFinding) => boolean): DepthRow[] {
  const clusters = buildPool(familyFindings, cache, { minSources: 1 });
  const rows = new Map<number, DepthRow>();
  for (const c of clusters) { const d = c.sources.size; const r = rows.get(d) ?? { depth: d, genuine: 0, total: 0 }; r.total++; if (hit(c.rep)) r.genuine++; rows.set(d, r); }
  return [...rows.values()].sort((a, b) => a.depth - b.depth);
}
const staticHit = (f: ReviewFinding, sa: StaticAnalysisFinding[]): boolean => sa.some((s) => s.file === f.file && Math.abs(s.line - f.line) <= 10);
const rangeHit = (f: ReviewFinding, cr: ChangedRange[]): boolean => cr.some((c) => c.file === f.file && f.line >= c.lineStart && f.line <= c.lineEnd);

const frac = (pairs: Array<[string, string]>, i: 0 | 1, c: string): number => pairs.filter((p) => p[i] === c).length / pairs.length;
const maxRunIndex = (runs: IndustrialRun[]): number => runs.reduce((m, r) => Math.max(m, r.runIndex), 0);
const round = (x: number, d = 3): number => { const m = 10 ** d; return Number.isFinite(x) ? Math.round(x * m) / m : 0; };
