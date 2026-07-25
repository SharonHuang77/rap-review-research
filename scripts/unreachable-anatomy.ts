/**
 * Anatomy of the unreachable core (doc-17 §10, item Z2; zero-LLM).
 *
 * §8 found the oracle reachable-set ceiling at ~83% — ~17% of injected ground truth
 * is covered by NO pure-LLM diff-scoped configuration we ran. §8 argued that residue
 * is an agency/execution problem, not a decorrelation one. This CHARACTERISES it:
 * for every GT issue, count how many of the 11 cached sources (7 families +
 * conditioned + Haiku temp sweep) cover it, bin into reachability tiers, and cross-tab
 * against defect CLASS. GT severity is unpopulated, but `category` splits cleanly:
 * empty ⇒ FUNCTIONAL defect (logic/behaviour: races, runtime errors, missing wiring),
 * named ⇒ CONVENTION defect (a house-style rule). Tiers:
 *   unreachable — 0 sources cover it (the hard core)
 *   fragile     — exactly 1 source (reachable only by one method; precision-prone)
 *   robust      — >= 2 sources
 *
 * The prediction: the unreachable core is dominated by FUNCTIONAL defects (which need
 * repo context / execution) plus MECHANICAL convention rules (which need a linter, per
 * doc-13) — i.e. exactly the two levers §8/②/③ point to, not more sampling. Coverage
 * uses the §6/§7.1 structural+semantic proxy (τ=0.7), each source with its OWN cache
 * (consistent with §8). Reachability is per-GT (not macro'd). EXPLORATORY.
 *
 * Env: SEMANTIC_THRESHOLD (=0.7). Run: node scripts/unreachable-anatomy.ts
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

// same 11 cached sources as §8 (name, runs, cache)
const SOURCES: readonly [string, string, string][] = [
  ["homo-T0.7", p("hetero-confirmatory", "ladder-haiku07-runs.json"), p("hetero-confirmatory", "ladder-haiku07-cache.json")],
  ["kimi", p("hetero-confirmatory", "hetero-runs-moonshotai.kimi-k2.5.json"), p("hetero-confirmatory", "hetero-cache.json")],
  ["glm", p("hetero-confirmatory", "hetero-runs-zai.glm-5.json"), p("hetero-confirmatory", "hetero-cache.json")],
  ["deepseek", p("hetero-confirmatory", "ladder-deepseek-runs.json"), p("hetero-confirmatory", "ladder-deepseek-cache.json")],
  ["nova", p("hetero-confirmatory", "ladder-nova-runs.json"), p("hetero-confirmatory", "ladder-nova-cache.json")],
  ["llama4", p("hetero-confirmatory", "ladder-llama4-runs.json"), p("hetero-confirmatory", "ladder-llama4-cache.json")],
  ["palmyra", p("hetero-confirmatory", "ladder-palmyra-runs.json"), p("hetero-confirmatory", "ladder-palmyra-cache.json")],
  ["conditioned", p("module-arm", "conditioned-union-runs.json"), p("module-arm", "conditioned-cache.json")],
  ["temp-T0", p("phase2-results", "qodo-all-runs.json"), p("phase2-results", "qodo-all-cache.json")],
  ["temp-T0.3", p("hetero-confirmatory", "tempsweep-T03-runs.json"), p("hetero-confirmatory", "tempsweep-T03-cache.json")],
  ["temp-T1.0", p("hetero-confirmatory", "tempsweep-T10-runs.json"), p("hetero-confirmatory", "tempsweep-T10-cache.json")],
];

const load = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const dedup = (fs: ReviewFinding[]): ReviewFinding[] => { const o: ReviewFinding[] = []; for (const f of fs) if (!o.some((k) => areDuplicateFindings(k, f))) o.push(f); return o; };
const normPath = (s: string): string => s.trim().replace(/^\.\//, "");
const matched = (f: ReviewFinding, g: GroundTruthIssue, c: SemanticScoreCache): boolean =>
  normPath(g.file) === normPath(f.file) && ((f.line >= g.lineStart && f.line <= g.lineEnd) || (c.get(f, g) ?? 0) >= TAU);

const cacheMemo = new Map<string, SemanticScoreCache>();
const loadCache = (path: string): SemanticScoreCache => { if (!cacheMemo.has(path)) cacheMemo.set(path, SemanticScoreCache.fromJSON(load<Record<string, number>>(path))); return cacheMemo.get(path)!; };

interface Source { name: string; byInst: Map<string, ReviewFinding[]>; cache: SemanticScoreCache }
const gtByInst = new Map<string, GroundTruthIssue[]>();
const sources: Source[] = [];
for (const [name, runsPath, cachePath] of SOURCES) {
  if (!existsSync(runsPath) || !existsSync(cachePath)) continue;
  const runs = load<BenchmarkRun[]>(runsPath).filter((r) => r.architecture === "agentless");
  const g = new Map<string, ReviewFinding[]>();
  for (const r of runs) { g.set(r.instanceId, [...(g.get(r.instanceId) ?? []), ...r.producedFindings]); if (!gtByInst.has(r.instanceId)) gtByInst.set(r.instanceId, r.groundTruth); }
  const byInst = new Map<string, ReviewFinding[]>();
  for (const [i, fs] of g) byInst.set(i, dedup(fs));
  sources.push({ name, byInst, cache: loadCache(cachePath) });
}
let insts = [...sources[0]!.byInst.keys()];
for (const s of sources) insts = insts.filter((i) => s.byInst.has(i));
insts = insts.filter((i) => (gtByInst.get(i)?.length ?? 0) > 0);

// per-GT coverage count across sources (each with its own cache)
const isFunctional = (g: GroundTruthIssue): boolean => !g.category || g.category.trim() === "";
interface Row { inst: string; g: GroundTruthIssue; cov: number; fn: boolean }
const rows: Row[] = [];
for (const i of insts) {
  const gt = gtByInst.get(i)!;
  for (const g of gt) {
    let cov = 0;
    for (const s of sources) if ((s.byInst.get(i) ?? []).some((f) => matched(f, g, s.cache))) cov += 1;
    rows.push({ inst: i, g, cov, fn: isFunctional(g) });
  }
}
const N = rows.length;
const tier = (c: number): "unreachable" | "fragile" | "robust" => (c === 0 ? "unreachable" : c === 1 ? "fragile" : "robust");
console.log(`Unreachable-core anatomy — ${insts.length} Qodo PRs, ${N} GT issues, ${sources.length} sources (τ=${TAU}).`);
console.log(`Functional (no category) = ${rows.filter((r) => r.fn).length}, Convention (named rule) = ${rows.filter((r) => !r.fn).length}.\n`);

// (1) reachability tier × defect class
const pct = (n: number, d: number): string => `${d ? ((100 * n) / d).toFixed(0) : "0"}%`;
function tierRow(label: string, rs: Row[]): void {
  const u = rs.filter((r) => tier(r.cov) === "unreachable").length;
  const f = rs.filter((r) => tier(r.cov) === "fragile").length;
  const rob = rs.filter((r) => tier(r.cov) === "robust").length;
  console.log(`  ${label.padEnd(20)} n=${String(rs.length).padStart(3)}   unreachable ${String(u).padStart(3)} (${pct(u, rs.length).padStart(4)})   fragile ${String(f).padStart(3)} (${pct(f, rs.length).padStart(4)})   robust ${String(rob).padStart(3)} (${pct(rob, rs.length).padStart(4)})`);
}
console.log("── reachability tier × defect class ──");
tierRow("ALL", rows);
tierRow("functional", rows.filter((r) => r.fn));
tierRow("convention", rows.filter((r) => !r.fn));

// (2) composition of the unreachable core
const core = rows.filter((r) => r.cov === 0);
console.log(`\n── the unreachable core (${core.length} issues = ${pct(core.length, N)} of GT) ──`);
console.log(`  composition: functional ${core.filter((r) => r.fn).length} (${pct(core.filter((r) => r.fn).length, core.length)}), convention ${core.filter((r) => !r.fn).length} (${pct(core.filter((r) => !r.fn).length, core.length)})`);

// (3) convention-unreachable: mechanical (lint's job, doc-13) vs conceptual
// deterministically checkable rule families (a linter/AST/analyzer can decide them)
const MECHANICAL = /format|biome|prettier|semicolon|quote|whitespace|import|clippy|ruff|swiftlint|lint|order|unused|type annotation|annotation|async|suffix|naming|co-?locat|access control|\bfinal\b|sealed|namespace|xunit|arrange-act-assert|mainactor|result type|-werror|warning|yarn|npm|tailwind|package manager/i;
const convCore = core.filter((r) => !r.fn);
const mech = convCore.filter((r) => MECHANICAL.test(r.g.category ?? "")).length;
console.log(`  convention-core: mechanical/lint-style ${mech} (${pct(mech, convCore.length)}), conceptual ${convCore.length - mech} (${pct(convCore.length - mech, convCore.length)})`);
const convByCat = new Map<string, number>();
for (const r of convCore) convByCat.set(r.g.category!, (convByCat.get(r.g.category!) ?? 0) + 1);
console.log("  top unreachable convention rules:");
for (const [cat, c] of [...convByCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`    ${c}×  ${cat.slice(0, 60)}`);

// (4) functional-unreachable: heuristic sub-types + examples
const fnCore = core.filter((r) => r.fn);
const TAGS: [string, RegExp][] = [
  ["null/undefined runtime", /undefined|null|optional chaining|nullable|nil\b/i],
  ["missing wiring/registration", /never (registered|called|invoked)|not (functioning|registered|wired)|missing .*(param|argument|dependency|await|call)/i],
  ["race/async/order", /race|concurren|async|await|initializ|order|boot|startup/i],
  ["cross-file/import/path", /import|require|path|circular|cross-|package|module resolution/i],
  ["harmful deletion/removal", /remov|delet|drop|strip|no longer/i],
];
console.log(`\n── functional core (${fnCore.length}) — heuristic sub-types (title+description; overlapping) ──`);
for (const [name, re] of TAGS) { const n = fnCore.filter((r) => re.test(`${r.g.title ?? ""} ${r.g.description ?? ""}`)).length; console.log(`  ${name.padEnd(28)} ${n} (${pct(n, fnCore.length)})`); }
console.log("  sample unreachable functional issues:");
for (const r of fnCore.slice(0, 8)) console.log(`    - ${(r.g.title ?? r.g.description ?? "").slice(0, 84)}`);
console.log(`\nTakeaway: if the core is mostly functional + mechanical-convention, the ~17% is a lint+agency+execution problem`);
console.log(`(doc-13 three levers; §8/②/③), NOT a decorrelation one. EXPLORATORY; coverage = structural+semantic proxy, lower-bounds the true hard core.`);
