/**
 * CRAB agentic reviewer (doc-18, experiment ②). Tests the AGENCY lever the whole
 * program points to: §8/§10 showed the ~15% functional hard-core (cross-file renames,
 * dynamic imports) is unreachable by any diff-scoped sampling, and doc-16 showed PASSIVE
 * whole-file context does not move recall. Here the reviewer can ACT: a ReAct loop over
 * Bedrock Converse native tool-use, with read-only repo-navigation tools bound to the
 * PR's review-base commit (read_file / list_dir / grep on the blobless CRAB clone). It
 * inspects the repo as needed, then calls submit_findings.
 *
 * Compares three arms on the SAME CRAB PRs, judged with ONE semantic cache:
 *   diff-only     (baseline; crab-structural-eval STRUCTURAL=0 runs, via DIFFONLY_RUNS)
 *   static-context(doc-16 Phase B; STRUCTURAL=1 runs, via STRUCTURAL_RUNS)  [optional]
 *   agentic       (this script)
 * Primary Q: does agency beat diff-only (and the passive static context) on recall?
 * EXPLORATORY; read-only (no execution — that is experiment ③). Live/paid.
 *
 * Env: CRAB_JSONL (=data/benchmark/crab-stage4.jsonl), CRAB_N (=20), CRAB_MAX_DIFF_KB
 *      (=40), MAX_TURNS (=8), LLM_DEFAULT_MODEL (frozen Haiku), JUDGE_MODEL,
 *      SEMANTIC_THRESHOLD (=0.7), AGENTIC_OUT (=crab-arm/agentic-runs.json),
 *      CACHE_OUT (=crab-arm/agentic-cache.json), DIFFONLY_RUNS, STRUCTURAL_RUNS,
 *      CRAB_CLONE_DIR. Run: AWS_PROFILE=bedrock CRAB_N=20 DIFFONLY_RUNS=... node scripts/crab-agentic-eval.ts
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { ConverseCommandInput, Message, Tool } from "@aws-sdk/client-bedrock-runtime";
import { LLM_CONFIG } from "../src/config/llm.ts";
import { fileAtCommit, listDir, grepRepo, ensureClone } from "../src/grounding/crab-repo-cache.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import { GroundTruthEvaluator } from "../src/benchmark/ground-truth-evaluator.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";
import { JudgeScorePrecomputer } from "../src/benchmark/matching/judge-score-precomputer.ts";
import { DEFAULT_JUDGE_CONFIG } from "../src/benchmark/matching/judge-prompt.ts";
import { ProviderRateLimitError } from "../src/llm/errors.ts";

if (LLM_CONFIG.provider !== "bedrock") { console.error("crab-agentic-eval needs the Bedrock provider (live)."); process.exit(1); }

const CRAB_JSONL = resolve(process.env.CRAB_JSONL ?? "data/benchmark/crab-stage4.jsonl");
const N = Math.max(1, Number(process.env.CRAB_N ?? 20));
const MAX_DIFF = Math.max(1, Number(process.env.CRAB_MAX_DIFF_KB ?? 40)) * 1024;
const MAX_TURNS = Math.max(2, Number(process.env.MAX_TURNS ?? 12));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_CONFIG.modelId;
const MODEL = LLM_CONFIG.defaultModel;
const AGENTIC_OUT = process.env.AGENTIC_OUT ?? "crab-arm/agentic-runs.json";
const CACHE_OUT = process.env.CACHE_OUT ?? "crab-arm/agentic-cache.json";

interface Inst { instanceId: string; rawDiff: string; groundTruth: GroundTruthIssue[]; repo: string; baseCommit: string }
const resolveLine = (c: any): number | undefined => {
  for (const v of [c.line, c.original_line, c.start_line, c.original_start_line]) if (typeof v === "number") return v;
  const m = c.diff_hunk?.match(/@@ -\d+(?:,\d+)? \+(\d+)/); return m ? Number(m[1]) : undefined;
};
const rows = readFileSync(CRAB_JSONL, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, any>);
const instances: Inst[] = [];
for (const r of rows) {
  const diff: string | undefined = r.commit_to_review?.patch_to_review;
  if (typeof diff !== "string" || diff.length > MAX_DIFF) continue;
  if (typeof r.repo !== "string" || typeof r.base_commit !== "string") continue;
  const gt: GroundTruthIssue[] = [];
  (r.reference_review_comments ?? []).forEach((c: any, i: number) => {
    const line = resolveLine(c);
    if (c.path && line !== undefined) gt.push({ id: `${r.instance_id}-rc-${i}`, file: c.path, lineStart: line, lineEnd: line, title: (c.text ?? "").slice(0, 80), description: c.text ?? "" });
  });
  if (gt.length === 0) continue;
  instances.push({ instanceId: r.instance_id, rawDiff: diff, groundTruth: gt, repo: r.repo, baseCommit: r.base_commit });
  if (instances.length >= N) break;
}
console.log(`CRAB agentic — ${instances.length} PRs (≤${MAX_DIFF / 1024}KB), model ${MODEL} @ ${LLM_CONFIG.region}, ≤${MAX_TURNS} turns`);
for (const repo of new Set(instances.map((i) => i.repo))) if (!ensureClone(repo)) console.log(`  clone FAILED: ${repo}`);

// ── tools ──
const TOOLS: Tool[] = [
  { toolSpec: { name: "read_file", description: "Read a file's full source at the PR review-base commit. Use to inspect changed files in full and follow imports.", inputSchema: { json: { type: "object", properties: { path: { type: "string", description: "repo-relative path" } }, required: ["path"] } } } },
  { toolSpec: { name: "list_dir", description: "List entry names under a directory at the review base (empty path = repo root). Use to discover where modules/definitions live.", inputSchema: { json: { type: "object", properties: { path: { type: "string", description: "repo-relative directory; empty for root" } }, required: [] } } } },
  { toolSpec: { name: "grep", description: "Case-insensitive fixed-string search at the review base, scoped to a directory/file (required). Use to find where a symbol is defined or used across files.", inputSchema: { json: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string", description: "repo-relative dir/file to scope the search" } }, required: ["pattern", "path"] } } } },
  { toolSpec: { name: "submit_findings", description: "Submit your final review findings and end the review. Call this exactly once when done.", inputSchema: { json: { type: "object", properties: { findings: { type: "array", items: { type: "object", properties: { title: { type: "string" }, category: { type: "string" }, severity: { type: "string", description: "low|medium|high" }, file: { type: "string" }, line: { type: "number" }, description: { type: "string" } }, required: ["title", "file", "line", "description"] } } }, required: ["findings"] } } } },
];
const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n)}\n… [truncated ${s.length - n} chars]`);
function execTool(inst: Inst, name: string, input: any): string {
  try {
    if (name === "read_file") { const src = fileAtCommit(inst.repo, inst.baseCommit, String(input.path ?? "")); return src === null ? "(file not found at review base)" : clip(src, 8000); }
    if (name === "list_dir") { const e = listDir(inst.repo, inst.baseCommit, String(input.path ?? "")); return e === null ? "(directory not found)" : e.slice(0, 200).join("\n") || "(empty)"; }
    if (name === "grep") { const h = grepRepo(inst.repo, inst.baseCommit, String(input.pattern ?? ""), String(input.path ?? "")); return h.length ? h.join("\n") : "(no matches)"; }
  } catch (e) { return `(tool error: ${(e as Error).message.slice(0, 120)})`; }
  return "(unknown tool)";
}

const SYSTEM = "You are an expert code reviewer reviewing a pull request. You are given the PR diff. " +
  "The diff alone is often not enough: a defect may depend on code in unchanged files, on how a changed " +
  "symbol is used elsewhere, or on an import that no longer resolves. You may call read-only tools to " +
  "inspect the repository AT THE REVIEW-BASE COMMIT (read_file, list_dir, grep) as many times as needed to " +
  "verify your concerns before reporting. Investigate cross-file and import/rename issues specifically. " +
  "Report only genuine defects a maintainer would want fixed (bugs, breakages, security, clear violations), " +
  "not style nits. When done, call submit_findings exactly once with each finding's file, line, and a clear description.";

const client = new BedrockRuntimeClient({ region: LLM_CONFIG.region });
interface Block { text?: string; toolUse?: { toolUseId?: string; name?: string; input?: any } }

async function converse(messages: Message[], forceSubmit = false): Promise<{ msg: Message; blocks: Block[]; stop: string }> {
  const toolConfig = forceSubmit ? { tools: TOOLS, toolChoice: { tool: { name: "submit_findings" } } } : { tools: TOOLS };
  const input: ConverseCommandInput = { modelId: MODEL, system: [{ text: SYSTEM }], messages, toolConfig, inferenceConfig: { temperature: 0, maxTokens: 1500 } };
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const out = await client.send(new ConverseCommand(input));
      const msg = out.output?.message ?? { role: "assistant", content: [] };
      return { msg, blocks: (msg.content ?? []) as Block[], stop: out.stopReason ?? "end_turn" };
    } catch (e) {
      const rate = (e as Error).name?.includes("Throttling") || (e as Error).name?.includes("TooManyRequests");
      if (attempt < 6) { await new Promise((r) => setTimeout(r, Math.min(30_000, (rate ? 4_000 : 1_500) * 2 ** (attempt - 1)))); continue; }
      throw e;
    }
  }
  return { msg: { role: "assistant", content: [] }, blocks: [], stop: "error" };
}

/** One agentic review trajectory → findings. */
async function reviewOne(inst: Inst): Promise<{ findings: ReviewFinding[]; turns: number; toolCalls: number }> {
  const messages: Message[] = [{ role: "user", content: [{ text: `## PR diff to review\n\n${clip(inst.rawDiff, 24_000)}\n\nInspect the repository as needed, then call submit_findings.` }] }];
  let toolCalls = 0; let nudged = false;
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    // final turn: force submit_findings so a long explorer always returns its findings.
    const { msg, blocks } = await converse(messages, turn === MAX_TURNS);
    messages.push(msg);
    const uses = blocks.filter((b) => b.toolUse);
    const submit = uses.find((b) => b.toolUse?.name === "submit_findings");
    if (submit) {
      const raw = (submit.toolUse?.input?.findings ?? []) as any[];
      const findings: ReviewFinding[] = raw.filter((f) => f && f.file && (f.description || f.title)).map((f, i) => ({
        id: `${inst.instanceId}-af-${i}`, title: String(f.title ?? f.description ?? "").slice(0, 120),
        category: String(f.category ?? "correctness"), severity: (["low", "medium", "high", "critical"].includes(String(f.severity)) ? String(f.severity) : "medium") as ReviewFinding["severity"],
        file: String(f.file), line: Number.isFinite(Number(f.line)) ? Number(f.line) : 0, description: String(f.description ?? f.title ?? ""),
      }));
      return { findings, turns: turn, toolCalls };
    }
    if (uses.length === 0) {
      if (nudged) return { findings: [], turns: turn, toolCalls };
      nudged = true;
      messages.push({ role: "user", content: [{ text: "Call submit_findings now with your findings (an empty list if none)." }] });
      continue;
    }
    const results = uses.map((b) => { toolCalls += 1; return { toolResult: { toolUseId: b.toolUse!.toolUseId, content: [{ text: clip(execTool(inst, b.toolUse!.name ?? "", b.toolUse!.input ?? {}), 8000) }] } }; });
    messages.push({ role: "user", content: results as Message["content"] });
  }
  return { findings: [], turns: MAX_TURNS, toolCalls };
}

// ── generate agentic runs ──
const agenticRuns: BenchmarkRun[] = [];
let done = 0, totTools = 0, totTurns = 0;
mkdirSync(dirname(resolve(AGENTIC_OUT)), { recursive: true });
for (const inst of instances) {
  const { findings, turns, toolCalls } = await reviewOne(inst);
  totTools += toolCalls; totTurns += turns;
  agenticRuns.push({ runId: `${inst.instanceId}#agentic`, datasetId: "crab-agentic", instanceId: inst.instanceId, snapshotId: inst.instanceId, experimentId: `${inst.instanceId}#agentic`, architecture: "agentless", producedFindings: findings, groundTruth: inst.groundTruth, rawDiff: inst.rawDiff });
  done += 1;
  writeFileSync(AGENTIC_OUT, JSON.stringify(agenticRuns, null, 2)); // incremental: a later stall never loses completed PRs
  console.log(`  [${done}/${instances.length}] ${inst.instanceId}: ${findings.length} findings, ${turns} turns, ${toolCalls} tool calls`);
}
console.log(`persisted ${agenticRuns.length} agentic runs → ${AGENTIC_OUT}`);

// ── judge all available arms with ONE cache, compare ──
const arms: { label: string; runs: BenchmarkRun[] }[] = [{ label: "agentic", runs: agenticRuns }];
const idset = new Set(instances.map((i) => i.instanceId));
const loadArm = (label: string, envVar?: string): void => {
  const path = envVar && process.env[envVar];
  if (path && existsSync(resolve(path))) { const runs = (JSON.parse(readFileSync(resolve(path), "utf8")) as BenchmarkRun[]).filter((r) => idset.has(r.instanceId)); if (runs.length) arms.unshift({ label, runs }); }
};
loadArm("diff-only", "DIFFONLY_RUNS");
loadArm("static-context", "STRUCTURAL_RUNS");

const provider = new BedrockProvider();
const cache = new SemanticScoreCache();
const allRuns = arms.flatMap((a) => a.runs);
console.log(`\nJUDGE — ${JUDGE_MODEL} over ${allRuns.length} runs across ${arms.length} arm(s)...`);
const precomputer = new JudgeScorePrecomputer(provider, { ...DEFAULT_JUDGE_CONFIG, modelId: JUDGE_MODEL });
for (let attempt = 1; attempt <= 8; attempt += 1) {
  try { await precomputer.precompute(allRuns, cache); break; }
  catch (error) {
    if (error instanceof ProviderRateLimitError && attempt < 8) { mkdirSync(dirname(resolve(CACHE_OUT)), { recursive: true }); writeFileSync(CACHE_OUT, JSON.stringify(cache.toJSON(), null, 2)); await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * 2 ** (attempt - 1)))); continue; }
    throw error;
  }
}
mkdirSync(dirname(resolve(CACHE_OUT)), { recursive: true });
writeFileSync(CACHE_OUT, JSON.stringify(cache.toJSON(), null, 2));

const semantic = new GroundTruthEvaluator({ matcher: new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(cache), semanticThreshold: TAU }) });
const macro = (runs: BenchmarkRun[]) => { const rs = runs.map((r) => semantic.evaluate(r)); const n = rs.length || 1; return { P: rs.reduce((a, x) => a + x.precision, 0) / n, R: rs.reduce((a, x) => a + x.recall, 0) / n, F1: rs.reduce((a, x) => a + x.f1, 0) / n, f: runs.reduce((a, r) => a + r.producedFindings.length, 0) / n }; };
console.log(`\n=== CRAB three-arm comparison (semantic τ=${TAU}, n=${instances.length} PRs, 1 trajectory/PR) ===`);
for (const { label, runs } of arms) { const m = macro(runs); console.log(`  ${label.padEnd(15)} P=${(m.P * 100).toFixed(0)}%  R=${(m.R * 100).toFixed(0)}%  F1=${m.F1.toFixed(2)}  findings/PR ${m.f.toFixed(1)}`); }
console.log(`\nagentic tool usage: mean ${(totTurns / instances.length).toFixed(1)} turns, ${(totTools / instances.length).toFixed(1)} tool calls/PR.`);
console.log(`Read: agency helps iff agentic recall > diff-only (and > static-context, the doc-16 passive null). EXPLORATORY, read-only tools, 1 trajectory/PR.`);
