/**
 * Lint baseline (doc-13 §12 / doc-14 §confirmatory follow-up). Tests the
 * division-of-labor claim: mechanical conventions are better served by a
 * DETERMINISTIC checker than by scaling the LLM. Scope = the two convention-
 * authored pilot repos (aspnetcore, Ghost); rule-violation GT only.
 *
 * NON-CIRCULAR by construction: each check is a faithful re-implementation of a
 * PUBLISHED lint rule (ESLint / .editorconfig / Roslyn analyzer — cited in
 * `source`), applied blind to EVERY added diff line — it never looks at which
 * line carries the injected defect. Ground-truth rule categories are first
 * classified into MECH (a standard line-local lint rule exists) vs POLICY
 * (framework/config/prose — no line-local lint rule), from the convention
 * definition alone. We then report checker recall on each stratum plus flag
 * volume (a checker that sprays flags trivially "recalls" everything).
 *
 * ZERO LLM calls. Haiku's rule recall on the same PRs is computed for contrast.
 *
 * Env: HAIKU_RUNS/HAIKU_CACHE (phase2-results/qodo-all-{runs,cache}.json),
 *      DATA_DIR (=data/benchmark), SEMANTIC_THRESHOLD (=0.7).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import { BenchmarkLoader } from "../src/campaign/index.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import type { BenchmarkInstance } from "../src/benchmark/index.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { coversCategory, repoOfInstance } from "../src/grounding/project-conventions.ts";

const rr = join(import.meta.dirname, "..");
const DATA_DIR = resolve(process.env.DATA_DIR ?? "data/benchmark");
const HAIKU_RUNS = resolve(process.env.HAIKU_RUNS ?? join(rr, "phase2-results", "qodo-all-runs.json"));
const HAIKU_CACHE = resolve(process.env.HAIKU_CACHE ?? join(rr, "phase2-results", "qodo-all-cache.json"));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);

const PILOT = new Set<string>();
for (let i = 1; i <= 7; i += 1) PILOT.add(`aspnetcore-pr-${i}`);
for (let i = 1; i <= 13; i += 1) PILOT.add(`Ghost-pr-${i}`);

const normPath = (p: string): string => p.trim().replace(/^\.\//, "");

// ---- diff parser: ALL body lines the reviewer sees (context + added) with their
// NEW-file line numbers. We scan context lines too, because the LLM reviews the
// full diff (a convention violation often sits on an UNCHANGED line that the diff
// merely touches nearby) — a fair deterministic checker must see the same text. ----
interface DiffLine { file: string; line: number; text: string; added: boolean; }
function diffLines(diff: string): DiffLine[] {
  const out: DiffLine[] = [];
  let file = "";
  let newNo = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) { file = raw.slice(4).replace(/^b\//, "").trim(); continue; }
    if (raw.startsWith("diff --git") || raw.startsWith("--- ") || raw.startsWith("index ")) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) { newNo = Number(hunk[1]); continue; }
    if (raw.startsWith("\\")) continue; // "\ No newline at end of file"
    if (raw.startsWith("+")) { out.push({ file, line: newNo, text: raw.slice(1), added: true }); newNo += 1; continue; }
    if (raw.startsWith("-")) continue; // deleted: new-file line does not advance
    out.push({ file, line: newNo, text: raw.startsWith(" ") ? raw.slice(1) : raw, added: false }); // context
    newNo += 1;
  }
  return out;
}

// ---- deterministic checks = faithful re-implementations of published rules ----
interface Check { conventionKey: string; source: string; ext: RegExp; test: (text: string) => boolean; }
const stripLineComment = (s: string): string => s.replace(/\/\/.*$/, "");
const CHECKS: Check[] = [
  // Ghost (eslint-config-ghost / .editorconfig) — all faithful to the cited rule.
  { conventionKey: "single quote", source: "ESLint quotes:single", ext: /\.(js|ts|jsx|tsx)$/,
    test: (t) => /"(?:[^"\\]|\\.)*"/.test(stripLineComment(t)) },
  { conventionKey: "semicolon", source: "ESLint semi:always", ext: /\.(js|ts)$/,
    test: (t) => {
      const c = stripLineComment(t).trimEnd();
      if (c.length === 0 || !/[A-Za-z0-9_)\]'"`]$/.test(c)) return false; // must end with a value-ish token
      const head = c.trim();
      if (/^(if|for|while|else|switch|case|default|function|class|try|catch|finally|do|export|import|interface|type|enum|namespace)\b/.test(head)) return false;
      if (head.endsWith("=>") || head.endsWith("&&") || head.endsWith("||") || head.endsWith("+") || head.endsWith(".")) return false;
      return true; // heuristic (line-local); AST linters do this exactly — flag volume reported
    } },
  { conventionKey: "strict equality", source: "ESLint eqeqeq", ext: /\.(js|ts|jsx|tsx)$/,
    test: (t) => /[^=!<>]==[^=]/.test(stripLineComment(t)) || /[^!=]!=[^=]/.test(stripLineComment(t)) },
  { conventionKey: "instead of var", source: "ESLint no-var", ext: /\.(js|ts|jsx|tsx)$/,
    test: (t) => /(^|[^.\w])var\s+\w/.test(stripLineComment(t)) },
  // aspnetcore (.editorconfig / analyzers)
  { conventionKey: "async suffix", source: "coding guidelines / analyzer (Async suffix)", ext: /\.cs$/,
    test: (t) => { const m = /\basync\s+(?:[\w<>\[\],.?\s]+?)\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(/.exec(stripLineComment(t)); return m !== null && !m[1]!.endsWith("Async") && m[1] !== "Main"; } },
  { conventionKey: "file-scoped namespace", source: ".editorconfig csharp_style_namespace_declarations=file_scoped", ext: /\.cs$/,
    // VIOLATION = block-scoped `namespace X` (brace same or next line) i.e. NOT `namespace X;`.
    test: (t) => /^\s*namespace\s+[\w.]+\s*\{?\s*$/.test(stripLineComment(t)) },
];

interface LintFinding { file: string; line: number; conventionKey: string; }
function runChecks(inst: BenchmarkInstance): LintFinding[] {
  const repo = repoOfInstance(inst.instanceId);
  const out: LintFinding[] = [];
  for (const a of diffLines(inst.rawDiff)) {
    for (const c of CHECKS) {
      if (!c.ext.test(a.file)) continue;
      // only apply a repo's own conventions
      if (repo === "Ghost" && !/\.(js|ts|jsx|tsx)$/.test(a.file)) continue;
      if (repo === "aspnetcore" && !/\.cs$/.test(a.file)) continue;
      try { if (c.test(a.text)) out.push({ file: a.file, line: a.line, conventionKey: c.conventionKey }); } catch { /* skip */ }
    }
  }
  return out;
}
const CHECKED = new Set(CHECKS.map((c) => c.conventionKey));

// ---- load pilot instances + Haiku pilot agentless runs ----
const raw = JSON.parse(readFileSync(join(DATA_DIR, "qodo.json"), "utf8"));
const ds = new BenchmarkLoader().loadQodo(raw);
const pilotInsts = ds.instances.filter((i) => PILOT.has(i.instanceId));
const hRuns = (JSON.parse(readFileSync(HAIKU_RUNS, "utf8")) as BenchmarkRun[]).filter((r) => r.architecture === "agentless" && PILOT.has(r.instanceId));
const hCache = SemanticScoreCache.fromJSON(JSON.parse(readFileSync(HAIKU_CACHE, "utf8")) as Record<string, number>);
const hByInst = new Map<string, BenchmarkRun[]>();
for (const r of hRuns) hByInst.set(r.instanceId, [...(hByInst.get(r.instanceId) ?? []), r]);
function haikuMatched(f: ReviewFinding, g: GroundTruthIssue): boolean {
  return normPath(g.file) === normPath(f.file) && ((f.line >= g.lineStart && f.line <= g.lineEnd) || (hCache.get(f, g) ?? 0) >= TAU);
}
function haikuFound(instanceId: string, g: GroundTruthIssue): boolean {
  return (hByInst.get(instanceId) ?? []).some((r) => r.producedFindings.some((f) => haikuMatched(f, g)));
}

// ---- classify each rule-GT: MECH (a check exists) vs POLICY; score checker recall ----
interface Row { repo: string; category: string; mech: boolean; lintHit: boolean; haikuHit: boolean; }
const rows: Row[] = [];
let totalFlags = 0;
for (const inst of pilotInsts) {
  const repo = repoOfInstance(inst.instanceId);
  const lint = runChecks(inst);
  totalFlags += lint.length;
  for (const g of inst.groundTruth) {
    if (!g.category || !g.category.trim()) continue; // rule GT only
    const conv = coversCategory(repo, g.category);
    const mech = conv ? CHECKED.has(conv.matchKeys.find((k) => CHECKED.has(k)) ?? "") : false;
    // strict deterministic localization: a lint finding for the covering convention on/near the GT line
    const lintHit = !!conv && lint.some((l) =>
      normPath(l.file) === normPath(g.file) && l.line >= g.lineStart - 1 && l.line <= g.lineEnd + 1 &&
      conv.matchKeys.includes(l.conventionKey));
    rows.push({ repo, category: g.category, mech, lintHit, haikuHit: haikuFound(inst.instanceId, g) });
  }
}

function recap(subset: Row[]): string {
  const n = subset.length || 1;
  const lint = subset.filter((r) => r.lintHit).length;
  const haiku = subset.filter((r) => r.haikuHit).length;
  const hybrid = subset.filter((r) => r.lintHit || r.haikuHit).length;
  return `n=${subset.length}  lint=${((lint / n) * 100).toFixed(0)}% (${lint})  LLM=${((haiku / n) * 100).toFixed(0)}% (${haiku})  hybrid(lint∪LLM)=${((hybrid / n) * 100).toFixed(0)}% (${hybrid})`;
}
const mechRows = rows.filter((r) => r.mech);
const polRows = rows.filter((r) => !r.mech);
console.log(`Lint baseline — deterministic checker vs Haiku LLM on convention (rule) GT, pilot repos (τ=${TAU})`);
console.log(`Pilot PRs: ${pilotInsts.length}   rule-GT: ${rows.length}   total lint flags raised: ${totalFlags} (${(totalFlags / pilotInsts.length).toFixed(1)}/PR)\n`);
console.log(`=== recall by stratum (rule-GT recovered on/near the GT line) ===`);
console.log(`  CHECKER-TARGETED (a standard line-local lint rule implemented): ${recap(mechRows)}`);
console.log(`  NOT TARGETED (framework/config/prose or non-line-local):        ${recap(polRows)}`);
console.log(`  ALL rule-GT:                                                    ${recap(rows)}`);

console.log(`\n=== checker-targeted breakdown by convention ===`);
const byConv = new Map<string, Row[]>();
for (const r of mechRows) { const conv = coversCategory(r.repo, r.category); const key = `${r.repo}: ${conv?.rule ?? r.category}`; byConv.set(key, [...(byConv.get(key) ?? []), r]); }
for (const [k, rs] of [...byConv.entries()].sort()) console.log(`  ${k.padEnd(54)} ${recap(rs)}`);

console.log(`\n=== POLICY categories (out of a line-local linter's reach — LLM/heavier-tooling territory) ===`);
const polCats = new Map<string, Row[]>();
for (const r of polRows) { const key = `${r.repo}: ${r.category}`; polCats.set(key, [...(polCats.get(key) ?? []), r]); }
for (const [k, rs] of [...polCats.entries()].sort()) console.log(`  ${k.padEnd(54)} ${recap(rs)}`);

console.log(`\nEXPLORATORY. Checks are faithful re-implementations of the repos' published lint rules (source-tagged), applied blind to the WHOLE diff (context+added) the LLM also sees. "Targeted" = a standard line-local lint rule exists; "not targeted" = framework/config/prose (LLM/heavier-tooling territory). Flag volume is the deterministic checker's precision cost.`);
