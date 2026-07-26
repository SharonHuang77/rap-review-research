/**
 * Reviewer-on-top execution experiment (doc-19 §6, the conclusive ③). Tests whether the
 * EXECUTION signal (a FAIL_TO_PASS traceback) lets a reviewer localize a defect it cannot
 * localize from the issue alone — the recall lever for the repo-integrated hard-core that
 * neither reading (doc-16/②) nor the light self-contained repro (§1–4, ~15%) reached.
 *
 * Two arms per SWE-bench instance, same model (Bedrock), same base context:
 *   A (read-only) : issue text → which source file(s) contain the bug?
 *   B (execution) : issue text + the FAIL_TO_PASS traceback (harvested by the empty-patch
 *                   harness run) → which source file(s)?
 * Ground truth = the files the GOLD patch changes. Recall = predicted ∩ gold ≠ ∅.
 * The only difference between arms is the traceback, so Δrecall isolates the execution signal.
 * ZERO new image builds (reuses the harness's test_output.txt); paid only for the 2N LLM calls.
 *
 * Env: SWE_RUN (=C:/Users/chntw/swe-run), RUN_ID, PRED_NAME (=noop), META_FILE, MODEL.
 * flask feature-add batch (§6.1, ceiling): RUN_ID=revnoop  META_FILE=reviewer_meta.json
 * runtime-error batch (§6.2, the positive): RUN_ID=revrt  META_FILE=reviewer_meta_rt.json
 * Run (after the matching no-op harness run):
 *   AWS_PROFILE=bedrock RUN_ID=revrt META_FILE=reviewer_meta_rt.json node scripts/swe-reviewer-eval.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import { LLM_CONFIG } from "../src/config/llm.ts";

if (LLM_CONFIG.provider !== "bedrock") { console.error("needs Bedrock (live)."); process.exit(1); }
const RUN = process.env.SWE_RUN ?? "C:/Users/chntw/swe-run";
const RUN_ID = process.env.RUN_ID ?? "revnoop";
const PRED_NAME = process.env.PRED_NAME ?? "noop";
const META_FILE = process.env.META_FILE ?? "reviewer_meta.json";
const MODEL = process.env.MODEL ?? LLM_CONFIG.defaultModel;

interface Meta { instance_id: string; repo: string; problem_statement: string; gold_files: string[]; fail_to_pass: string[] }
const meta = JSON.parse(readFileSync(join(RUN, META_FILE), "utf8")) as Meta[];
const base = (p: string): string => p.split("/").pop()!;

/** Failing-test section of test_output.txt: drop PASSED-line noise, keep failures + tracebacks. */
function traceback(iid: string): string {
  const p = join(RUN, "logs", "run_evaluation", RUN_ID, PRED_NAME, iid, "test_output.txt");
  if (!existsSync(p)) return "";
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => !l.startsWith("PASSED") && l.trim() !== "");
  const txt = lines.join("\n");
  const i = txt.search(/FAILURES|Traceback|Error|assert/);
  return (i >= 0 ? txt.slice(i) : txt).slice(0, 5000);
}

const provider = new BedrockProvider();
const SYSTEM = "You localize a bug in a Python repository. You are given the repo name and an issue; " +
  "the source lives under the package directory. Name the source file(s) most likely to CONTAIN the " +
  "bug that must be edited to fix it. Respond with ONLY a JSON array of repo-relative file paths " +
  '(e.g. ["src/pkg/foo.py"]), most-likely first, at most 3.';

function parseFiles(text: string): string[] {
  // Accept only the model's JSON array answer; prefer one containing a .py path (skip quoted
  // non-answer brackets). Never scavenge .py paths from prose — that would count files the model
  // merely mentioned while reasoning as its localization, spuriously inflating recall.
  let firstArr: string[] | null = null;
  for (const g of text.match(/\[[\s\S]*?\]/g) ?? []) {
    try {
      const a = JSON.parse(g);
      if (Array.isArray(a)) { const s = a.map(String); if (s.some((x) => x.includes(".py"))) return s; firstArr ??= s; }
    } catch { /* keep scanning */ }
  }
  return firstArr ?? [];
}
const hit = (pred: string[], gold: string[]): boolean => pred.some((p) => gold.some((g) => g === p || g.endsWith(p) || p.endsWith(g) || base(p) === base(g)));

async function ask(repo: string, issue: string, tb: string): Promise<{ files: string[]; raw: string }> {
  const user = `## Repository\n${repo}\n\n## Issue\n${issue.slice(0, 4000)}` +
    (tb ? `\n\n## Failing test output (execution)\n${tb}` : "") +
    `\n\nWhich source file(s) contain the bug? JSON array of paths only.`;
  const res = await provider.review({ systemPrompt: SYSTEM, userPrompt: user, modelId: MODEL, temperature: 0, maxTokens: 800 });
  return { files: parseFiles(res.text), raw: res.text };
}

/** Does the harvested traceback even NAME the fix file? (crash-site == fix-site ⇒ headroom for B) */
const goldInTb = (tb: string, gold: string[]): boolean =>
  gold.some((g) => tb.includes(g) || tb.includes(base(g)));

console.log(`Reviewer-on-top (execution) — ${meta.length} SWE-bench instances, model ${MODEL}\n`);
let aHit = 0, bHit = 0;
let sN = 0, saHit = 0, sbHit = 0; // sub-slice: traceback names the fix file
for (const m of meta) {
  const tb = traceback(m.instance_id);
  const inTb = goldInTb(tb, m.gold_files);
  const a = await ask(m.repo, m.problem_statement, "");
  const b = await ask(m.repo, m.problem_statement, tb);
  const ah = hit(a.files, m.gold_files), bh = hit(b.files, m.gold_files);
  if (ah) aHit += 1; if (bh) bHit += 1;
  if (inTb) { sN += 1; if (ah) saHit += 1; if (bh) sbHit += 1; }
  console.log(`${m.instance_id}  gold=${m.gold_files.map(base).join(",")}  tb=${tb ? `${tb.length}c` : "MISSING"}  goldInTb=${inTb ? "YES" : "no"}`);
  console.log(`   A read-only : ${ah ? "HIT " : "miss"}  ${JSON.stringify(a.files).slice(0, 90)}  [${a.raw.length}c]`);
  console.log(`      A tail: ${JSON.stringify(a.raw.slice(-160))}`);
  console.log(`   B execution : ${bh ? "HIT " : "miss"}  ${JSON.stringify(b.files).slice(0, 90)}  [${b.raw.length}c]`);
  console.log(`      B tail: ${JSON.stringify(b.raw.slice(-160))}`);
}
const n = meta.length || 1;
console.log(`\n=== localization recall (n=${meta.length}) ===`);
console.log(`  A read-only : ${aHit}/${meta.length} (${((aHit / n) * 100).toFixed(0)}%)`);
console.log(`  B execution : ${bHit}/${meta.length} (${((bHit / n) * 100).toFixed(0)}%)   Δ ${bHit - aHit >= 0 ? "+" : ""}${bHit - aHit}`);
if (sN > 0) {
  console.log(`\n=== sub-slice: traceback NAMES the fix file (goldInTb, n=${sN}) — where execution CAN help ===`);
  console.log(`  A read-only : ${saHit}/${sN} (${((saHit / sN) * 100).toFixed(0)}%)`);
  console.log(`  B execution : ${sbHit}/${sN} (${((sbHit / sN) * 100).toFixed(0)}%)   Δ ${sbHit - saHit >= 0 ? "+" : ""}${sbHit - saHit}`);
}
console.log(`\nΔ>0 ⇒ the traceback localizes defects the issue alone misses. Δ=0 with A=100% ⇒ CEILING (issue already localizes).`);
console.log(`EXPLORATORY, small n. The goldInTb sub-slice isolates instances where crash-site == fix-site (execution CAN add signal); goldInTb=no ⇒ traceback crashed elsewhere (the crash-site≠fix-site caveat).`);
