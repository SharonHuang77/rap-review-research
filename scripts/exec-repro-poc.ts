/**
 * Execution-arm POC (③): minimal self-contained repro + lightweight execution — NO
 * sandbox, NO repo checkout, NO dependency install. For each candidate finding, ask the
 * model to write a fully self-contained snippet (stdlib only) that reconstructs just
 * enough of the changed logic to DEMONSTRATE the claimed defect (print BUG_REPRODUCED +
 * exit 1 if it manifests, OK + exit 0 if not), or {skip:true} if it cannot be reproduced
 * self-contained (needs repo/framework/network/fs/3rd-party). We run the snippet in a
 * timed subprocess and classify. The question the POC answers: on the functional defects,
 * what fraction is reachable by this LIGHT path, and does REPRO align with true positives
 * (i.e. is minimal-repro execution a usable precision signal)?
 *
 * Honest scope: self-contained repro only covers EXTRACTABLE-logic bugs (off-by-one,
 * wrong operator, coercion, edges); deeply repo/framework-integrated bugs SKIP. The SKIP
 * rate is itself the result. Security: runs LLM-generated code in a subprocess with an
 * 8s timeout on a trusted research machine — acceptable for a POC; production needs real
 * isolation. Live (paid, cheap) generation; local execution.
 *
 * Env: RUNS (=phase2-results/qodo-all-runs.json), CACHE (=phase2-results/qodo-all-cache.json),
 *      N (=10), TIMEOUT_MS (=8000), SEMANTIC_THRESHOLD (=0.7), FUNCTIONAL_ONLY (=1).
 * Run: AWS_PROFILE=bedrock N=10 node scripts/exec-repro-poc.ts
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import { LLM_CONFIG } from "../src/config/llm.ts";
import { BenchmarkLoader } from "../src/campaign/index.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";

if (LLM_CONFIG.provider !== "bedrock") { console.error("needs Bedrock (live)."); process.exit(1); }
const rr = join(import.meta.dirname, "..");
const RUNS = resolve(process.env.RUNS ?? join(rr, "phase2-results", "qodo-all-runs.json"));
const CACHE = resolve(process.env.CACHE ?? join(rr, "phase2-results", "qodo-all-cache.json"));
const N = Math.max(1, Number(process.env.N ?? 10));
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 8000);
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const FUNCTIONAL_ONLY = (process.env.FUNCTIONAL_ONLY ?? "1") === "1";

const load = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const normPath = (s: string): string => s.trim().replace(/^\.\//, "");
const cache = SemanticScoreCache.fromJSON(load<Record<string, number>>(CACHE));
const matched = (f: ReviewFinding, g: GroundTruthIssue): boolean =>
  normPath(g.file) === normPath(f.file) && ((f.line >= g.lineStart && f.line <= g.lineEnd) || (cache.get(f, g) ?? 0) >= TAU);

const qodo = new BenchmarkLoader().loadQodo(load(join(rr, "data", "benchmark", "qodo.json")));
const diffOf = new Map<string, string>(qodo.instances.map((i) => [i.instanceId, i.rawDiff]));

// build labeled finding pool: (finding, its instance's diff+GT, isTP, onFunctional)
interface Item { inst: string; f: ReviewFinding; tp: boolean; functional: boolean }
const pool: Item[] = [];
const seen = new Set<string>();
for (const r of load<BenchmarkRun[]>(RUNS).filter((r) => r.architecture === "agentless")) {
  if (!diffOf.has(r.instanceId)) continue;
  for (const f of r.producedFindings) {
    const key = `${r.instanceId}::${f.file}::${f.line}::${f.title}`;
    if (seen.has(key)) continue; seen.add(key);
    const hit = r.groundTruth.find((g) => matched(f, g));
    const functional = hit ? !hit.category || hit.category.trim() === "" : (!f.category || /correct|logic|bug|function|runtime|null|race/i.test(f.category));
    pool.push({ inst: r.instanceId, f, tp: !!hit, functional });
  }
}
// balanced small sample: prefer functional; half TP, half FP
const pick = (tp: boolean): Item[] => pool.filter((x) => x.tp === tp && (!FUNCTIONAL_ONLY || x.functional));
const rnd = <T,>(a: T[]): T[] => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((z) => z[1]);
const sample = [...rnd(pick(true)).slice(0, Math.ceil(N / 2)), ...rnd(pick(false)).slice(0, Math.floor(N / 2))];
console.log(`Execution-repro POC — ${sample.length} findings (${sample.filter((s) => s.tp).length} TP / ${sample.filter((s) => !s.tp).length} FP), ${FUNCTIONAL_ONLY ? "functional-only, " : ""}model ${LLM_CONFIG.defaultModel}, ${TIMEOUT_MS}ms timeout\n`);

const SYSTEM =
  "You are given a code diff and ONE finding claiming a defect in it. Write a MINIMAL, FULLY " +
  "SELF-CONTAINED reproduction in Python or JavaScript, STANDARD LIBRARY ONLY (do NOT import the " +
  "project or any 3rd-party package). Reconstruct just enough of the changed logic to test the " +
  "claim: if the defect is REAL the program must print BUG_REPRODUCED and exit with a nonzero code; " +
  "if the code is actually correct it must print OK and exit 0. Respond with EITHER the single word " +
  "SKIP (if it cannot be reproduced self-contained — needs the repo, a framework, network, " +
  "filesystem, or external libraries), OR exactly one fenced code block tagged python or javascript " +
  "containing the repro. No other text, no explanation.";

const provider = new BedrockProvider();
/** Robust: pull a fenced code block (code never has to survive JSON escaping) or SKIP. */
function parse(text: string): { skip?: boolean; lang?: string; code?: string } | undefined {
  const m = /```(python|py|javascript|js)\s*\n([\s\S]*?)```/i.exec(text);
  if (m) return { lang: /^(py|python)$/i.test(m[1]!) ? "python" : "javascript", code: m[2]! };
  if (/\bSKIP\b/i.test(text)) return { skip: true };
  return undefined;
}
const dir = mkdtempSync(join(tmpdir(), "repro-"));
function runSnippet(lang: string, code: string): { cls: string; detail: string } {
  const py = lang === "python";
  const file = join(dir, `r_${Math.random().toString(36).slice(2)}.${py ? "py" : "js"}`);
  writeFileSync(file, code);
  try {
    const out = execFileSync(py ? "python" : "node", py ? ["-I", file] : [file], { encoding: "utf8", timeout: TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] });
    return { cls: out.includes("OK") ? "NOREPRO" : "ERROR", detail: out.trim().slice(0, 60) };  // exit 0
  } catch (e: any) {
    if (e.killed || e.signal === "SIGTERM") return { cls: "TIMEOUT", detail: "" };
    const so = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
    if (so.includes("BUG_REPRODUCED")) return { cls: "REPRO", detail: `exit ${e.status}` };  // demonstrated
    return { cls: "ERROR", detail: (e.stderr?.toString() ?? "").trim().split("\n").pop()?.slice(0, 70) ?? "broken" };
  }
}

const tally: Record<string, { tp: number; fp: number }> = {};
const bump = (cls: string, tp: boolean): void => { (tally[cls] ??= { tp: 0, fp: 0 })[tp ? "tp" : "fp"] += 1; };
let done = 0;
for (const it of sample) {
  const diff = (diffOf.get(it.inst) ?? "").slice(0, 8000);
  const finding = `file: ${it.f.file}\nline: ${it.f.line}\ntitle: ${it.f.title}\ndescription: ${it.f.description}`;
  let cls = "ERROR", detail = "gen-failed";
  try {
    const res = await provider.review({ systemPrompt: SYSTEM, userPrompt: `## Diff\n${diff}\n\n## Finding\n${finding}`, modelId: LLM_CONFIG.defaultModel, temperature: 0, maxTokens: 900 });
    const p = parse(res.text);
    if (!p) { cls = "ERROR"; detail = "unparsed"; }
    else if (p.skip || !p.code) { cls = "SKIP"; detail = ""; }
    else ({ cls, detail } = runSnippet(p.lang === "python" ? "python" : "javascript", p.code));
  } catch (e) { cls = "ERROR"; detail = `gen: ${(e as Error).message.slice(0, 40)}`; }
  bump(cls, it.tp);
  done += 1;
  console.log(`  [${done}/${sample.length}] ${it.tp ? "TP" : "FP"} ${it.inst} ${it.f.file}:${it.f.line} → ${cls}${detail ? `  (${detail})` : ""}`);
}

console.log(`\n=== outcome × label ===`);
for (const [cls, c] of Object.entries(tally)) console.log(`  ${cls.padEnd(9)} TP ${c.tp}  FP ${c.fp}`);
const reproTP = tally.REPRO?.tp ?? 0, reproFP = tally.REPRO?.fp ?? 0;
const ran = Object.entries(tally).filter(([k]) => k === "REPRO" || k === "NOREPRO").reduce((a, [, c]) => a + c.tp + c.fp, 0);
console.log(`\nReachability: ${ran}/${sample.length} findings produced a RUNNABLE self-contained repro (rest SKIP/ERROR/TIMEOUT).`);
console.log(`Signal: of REPRO (bug demonstrated) ${reproTP} were TP vs ${reproFP} FP — execution ${reproTP > reproFP ? "aligns with" : "does NOT cleanly separate"} true defects on this sample.`);
console.log(`\nEXPLORATORY, n=${sample.length}. Light path (no sandbox); covers extractable-logic bugs only — SKIP rate = the fraction needing the heavy repo path.`);
