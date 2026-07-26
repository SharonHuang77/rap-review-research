/**
 * Lint ∪ LLM-union ceiling arm (doc-17 §11; zero-LLM). doc-13/`lint-baseline.ts`
 * showed a deterministic checker beats a SINGLE Haiku on mechanical conventions;
 * §8/§10 showed the ~17% unreachable core is mostly lint-targetable convention that a
 * whole decorrelated LLM UNION still misses (correlated blind spot). This closes the
 * loop: where a deterministic checker actually exists (the two convention-authored
 * pilot repos, 6 published lint rules), does adding it recover the convention defects
 * the FULL 11-config union (§8) cannot reach — i.e. how much does wiring in a linter
 * raise the ceiling?
 *
 * For each rule-GT on the pilot repos: unionHit = covered by ANY of the §8 sources
 * (each with its own judge cache); lintHit = a faithful re-implementation of the repo's
 * published rule fires on/near the GT line (checks copied VERBATIM from lint-baseline.ts,
 * source-tagged, applied blind to the whole diff). Reports union / lint / hybrid recall,
 * and the headline: of the rule-GT the union MISSES, what fraction lint recovers. ZERO
 * LLM calls (cached findings + deterministic checks). EXPLORATORY; pilot-scoped.
 *
 * Env: DATA_DIR (=data/benchmark), SEMANTIC_THRESHOLD (=0.7).
 * Run: node scripts/lint-hybrid-ceiling.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import { BenchmarkLoader } from "../src/campaign/index.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import type { BenchmarkInstance } from "../src/benchmark/index.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { areDuplicateFindings } from "../src/architectures/shared/finding-dedup.ts";
import { coversCategory, repoOfInstance } from "../src/grounding/project-conventions.ts";

const rr = join(import.meta.dirname, "..");
const DATA_DIR = resolve(process.env.DATA_DIR ?? join(rr, "data", "benchmark"));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const p = (...s: string[]): string => join(rr, ...s);
const normPath = (s: string): string => s.trim().replace(/^\.\//, "");

const PILOT = new Set<string>();
for (let i = 1; i <= 7; i += 1) PILOT.add(`aspnetcore-pr-${i}`);
for (let i = 1; i <= 13; i += 1) PILOT.add(`Ghost-pr-${i}`);

// ── deterministic checks: copied VERBATIM from lint-baseline.ts (doc-13), frozen ──
interface DiffLine { file: string; line: number; text: string; added: boolean }
function diffLines(diff: string): DiffLine[] {
  const out: DiffLine[] = []; let file = ""; let newNo = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) { file = raw.slice(4).replace(/^b\//, "").trim(); continue; }
    if (raw.startsWith("diff --git") || raw.startsWith("--- ") || raw.startsWith("index ")) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) { newNo = Number(hunk[1]); continue; }
    if (raw.startsWith("\\")) continue;
    if (raw.startsWith("+")) { out.push({ file, line: newNo, text: raw.slice(1), added: true }); newNo += 1; continue; }
    if (raw.startsWith("-")) continue;
    out.push({ file, line: newNo, text: raw.startsWith(" ") ? raw.slice(1) : raw, added: false }); newNo += 1;
  }
  return out;
}
interface Check { conventionKey: string; source: string; ext: RegExp; test: (text: string) => boolean }
const stripLineComment = (s: string): string => s.replace(/\/\/.*$/, "");
const CHECKS: Check[] = [
  { conventionKey: "single quote", source: "ESLint quotes:single", ext: /\.(js|ts|jsx|tsx)$/, test: (t) => /"(?:[^"\\]|\\.)*"/.test(stripLineComment(t)) },
  { conventionKey: "semicolon", source: "ESLint semi:always", ext: /\.(js|ts)$/, test: (t) => {
      const c = stripLineComment(t).trimEnd();
      if (c.length === 0 || !/[A-Za-z0-9_)\]'"`]$/.test(c)) return false;
      const head = c.trim();
      if (/^(if|for|while|else|switch|case|default|function|class|try|catch|finally|do|export|import|interface|type|enum|namespace)\b/.test(head)) return false;
      if (head.endsWith("=>") || head.endsWith("&&") || head.endsWith("||") || head.endsWith("+") || head.endsWith(".")) return false;
      return true; } },
  { conventionKey: "strict equality", source: "ESLint eqeqeq", ext: /\.(js|ts|jsx|tsx)$/, test: (t) => /[^=!<>]==[^=]/.test(stripLineComment(t)) || /[^!=]!=[^=]/.test(stripLineComment(t)) },
  { conventionKey: "instead of var", source: "ESLint no-var", ext: /\.(js|ts|jsx|tsx)$/, test: (t) => /(^|[^.\w])var\s+\w/.test(stripLineComment(t)) },
  { conventionKey: "async suffix", source: "coding guidelines / analyzer (Async suffix)", ext: /\.cs$/, test: (t) => { const m = /\basync\s+(?:[\w<>\[\],.?\s]+?)\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(/.exec(stripLineComment(t)); return m !== null && !m[1]!.endsWith("Async") && m[1] !== "Main"; } },
  { conventionKey: "file-scoped namespace", source: ".editorconfig csharp_style_namespace_declarations=file_scoped", ext: /\.cs$/, test: (t) => /^\s*namespace\s+[\w.]+\s*\{?\s*$/.test(stripLineComment(t)) },
];
const CHECKED = new Set(CHECKS.map((c) => c.conventionKey));
interface LintFinding { file: string; line: number; conventionKey: string }
function runChecks(inst: BenchmarkInstance): LintFinding[] {
  const repo = repoOfInstance(inst.instanceId); const out: LintFinding[] = [];
  for (const a of diffLines(inst.rawDiff)) for (const c of CHECKS) {
    if (!c.ext.test(a.file)) continue;
    if (repo === "Ghost" && !/\.(js|ts|jsx|tsx)$/.test(a.file)) continue;
    if (repo === "aspnetcore" && !/\.cs$/.test(a.file)) continue;
    try { if (c.test(a.text)) out.push({ file: a.file, line: a.line, conventionKey: c.conventionKey }); } catch { /* skip */ }
  }
  return out;
}

// ── §8 LLM sources (11 configs), each scored with its OWN cache; union over pilot PRs ──
const SOURCES: readonly [string, string][] = [
  [p("hetero-confirmatory", "ladder-haiku07-runs.json"), p("hetero-confirmatory", "ladder-haiku07-cache.json")],
  [p("hetero-confirmatory", "hetero-runs-moonshotai.kimi-k2.5.json"), p("hetero-confirmatory", "hetero-cache.json")],
  [p("hetero-confirmatory", "hetero-runs-zai.glm-5.json"), p("hetero-confirmatory", "hetero-cache.json")],
  [p("hetero-confirmatory", "ladder-deepseek-runs.json"), p("hetero-confirmatory", "ladder-deepseek-cache.json")],
  [p("hetero-confirmatory", "ladder-nova-runs.json"), p("hetero-confirmatory", "ladder-nova-cache.json")],
  [p("hetero-confirmatory", "ladder-llama4-runs.json"), p("hetero-confirmatory", "ladder-llama4-cache.json")],
  [p("hetero-confirmatory", "ladder-palmyra-runs.json"), p("hetero-confirmatory", "ladder-palmyra-cache.json")],
  [p("module-arm", "conditioned-union-runs.json"), p("module-arm", "conditioned-cache.json")],
  [p("phase2-results", "qodo-all-runs.json"), p("phase2-results", "qodo-all-cache.json")],
  [p("hetero-confirmatory", "tempsweep-T03-runs.json"), p("hetero-confirmatory", "tempsweep-T03-cache.json")],
  [p("hetero-confirmatory", "tempsweep-T10-runs.json"), p("hetero-confirmatory", "tempsweep-T10-cache.json")],
];
const load = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const dedup = (fs: ReviewFinding[]): ReviewFinding[] => { const o: ReviewFinding[] = []; for (const f of fs) if (!o.some((k) => areDuplicateFindings(k, f))) o.push(f); return o; };
const matched = (f: ReviewFinding, g: GroundTruthIssue, c: SemanticScoreCache): boolean =>
  normPath(g.file) === normPath(f.file) && ((f.line >= g.lineStart && f.line <= g.lineEnd) || (c.get(f, g) ?? 0) >= TAU);
const cacheMemo = new Map<string, SemanticScoreCache>();
const loadCache = (path: string): SemanticScoreCache => { if (!cacheMemo.has(path)) cacheMemo.set(path, SemanticScoreCache.fromJSON(load<Record<string, number>>(path))); return cacheMemo.get(path)!; };
interface Src { byInst: Map<string, ReviewFinding[]>; cache: SemanticScoreCache }
const srcs: Src[] = [];
for (const [runsPath, cachePath] of SOURCES) {
  if (!existsSync(runsPath) || !existsSync(cachePath)) continue;
  const runs = load<BenchmarkRun[]>(runsPath).filter((r) => r.architecture === "agentless" && PILOT.has(r.instanceId));
  const g = new Map<string, ReviewFinding[]>();
  for (const r of runs) g.set(r.instanceId, [...(g.get(r.instanceId) ?? []), ...r.producedFindings]);
  const byInst = new Map<string, ReviewFinding[]>();
  for (const [i, fs] of g) byInst.set(i, dedup(fs));
  srcs.push({ byInst, cache: loadCache(cachePath) });
}
const unionFound = (instanceId: string, g: GroundTruthIssue): boolean =>
  srcs.some((s) => (s.byInst.get(instanceId) ?? []).some((f) => matched(f, g, s.cache)));

// ── build rows over pilot rule-GT ──
const ds = new BenchmarkLoader().loadQodo(load(join(DATA_DIR, "qodo.json")));
const pilotInsts = ds.instances.filter((i) => PILOT.has(i.instanceId));
interface Row { repo: string; category: string; mech: boolean; lintHit: boolean; unionHit: boolean }
const ruleRows: Row[] = [];
let allGtN = 0, allUnion = 0, allHybrid = 0; // net ceiling over ALL pilot GT (functional + convention)
for (const inst of pilotInsts) {
  const repo = repoOfInstance(inst.instanceId);
  const lint = runChecks(inst);
  for (const g of inst.groundTruth) {
    const uHit = unionFound(inst.instanceId, g);
    const conv = g.category?.trim() ? coversCategory(repo, g.category) : undefined;
    const lHit = !!conv && lint.some((l) => normPath(l.file) === normPath(g.file) && l.line >= g.lineStart - 1 && l.line <= g.lineEnd + 1 && conv.matchKeys.includes(l.conventionKey));
    allGtN += 1; if (uHit) allUnion += 1; if (uHit || lHit) allHybrid += 1;
    if (!g.category || !g.category.trim()) continue; // rule-GT only for the strata below
    const mech = conv ? CHECKED.has(conv.matchKeys.find((k) => CHECKED.has(k)) ?? "") : false;
    ruleRows.push({ repo, category: g.category, mech, lintHit: lHit, unionHit: uHit });
  }
}

const pctOf = (n: number, d: number): string => `${d ? ((100 * n) / d).toFixed(0) : "0"}%`;
function recap(rs: Row[]): string {
  const n = rs.length || 1;
  const u = rs.filter((r) => r.unionHit).length, l = rs.filter((r) => r.lintHit).length, h = rs.filter((r) => r.unionHit || r.lintHit).length;
  return `n=${String(rs.length).padStart(3)}  LLM-union=${pctOf(u, n).padStart(4)} (${u})  lint=${pctOf(l, n).padStart(4)} (${l})  hybrid=${pctOf(h, n).padStart(4)} (${h})`;
}
const mech = ruleRows.filter((r) => r.mech), pol = ruleRows.filter((r) => !r.mech);
console.log(`Lint ∪ LLM-union ceiling — pilot repos (aspnetcore+Ghost), ${pilotInsts.length} PRs, ${srcs.length} LLM sources, τ=${TAU}\n`);
console.log(`=== convention rule-GT recall: LLM-union (11 configs) vs deterministic lint vs hybrid ===`);
console.log(`  CHECKER-TARGETED (a lint rule exists): ${recap(mech)}`);
console.log(`  NOT TARGETED (framework/policy):       ${recap(pol)}`);
console.log(`  ALL rule-GT:                           ${recap(ruleRows)}`);

// headline: of the checker-targeted rule-GT the UNION misses, how many does lint recover
const unionMiss = mech.filter((r) => !r.unionHit);
const recovered = unionMiss.filter((r) => r.lintHit).length;
console.log(`\n=== the ceiling lift ===`);
console.log(`  checker-targeted rule-GT the full LLM union MISSES: ${unionMiss.length}`);
console.log(`  ...of those, lint recovers: ${recovered} (${pctOf(recovered, unionMiss.length)})  ← how much a linter buys ON TOP of decorrelated sampling`);
console.log(`  net over ALL pilot GT (functional+convention, ${allGtN}): LLM-union ${pctOf(allUnion, allGtN)} → hybrid ${pctOf(allHybrid, allGtN)}  (+${pctOf(allHybrid - allUnion, allGtN)})`);
console.log(`\nEXPLORATORY, zero-LLM. Lint checks are frozen re-implementations of the pilot repos' published rules (copied from lint-baseline.ts). Pilot-scoped: only the 6 rules with a deterministic checker; the true lint lift on all repos/languages would need their linters wired in.`);
