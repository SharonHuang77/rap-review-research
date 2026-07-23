/**
 * CRAB structural-grounding eval (doc-16, Phase B). Generates the agentless arm
 * on N CRAB PRs under two context conditions and judges semantically:
 *   STRUCTURAL=0 → diff-only (base PromptBuilder; = crab-pilot content)
 *   STRUCTURAL=1 → diff + whole changed files + 1-hop local deps at review base
 * Only the injected context differs. EXPLORATORY; not the registered confirmatory;
 * does not touch prompt-freeze-v1.
 *
 * Run (per condition):
 *   AWS_PROFILE=bedrock STRUCTURAL=1 RUNS_PER_INSTANCE=3 \
 *   RUNS_OUT=crab-arm/structural-runs.json CACHE_OUT=crab-arm/structural-cache.json \
 *   node scripts/crab-structural-eval.ts
 * Env: CRAB_JSONL (=data/benchmark/crab-stage4.jsonl), CRAB_N (=50),
 *      CRAB_MAX_DIFF_KB (=40), STRUCTURAL (=0), RUNS_PER_INSTANCE (=3),
 *      LLM_DEFAULT_MODEL (frozen Haiku default), JUDGE_MODEL, SEMANTIC_THRESHOLD (=0.7),
 *      RUNS_OUT, CACHE_OUT, CRAB_CLONE_DIR.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

import { createPRImportService } from "../src/services/snapshot/index.ts";
import { createExperimentService } from "../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../src/architectures/in-memory-architecture-registry.ts";
import { AgentlessArchitecture } from "../src/architectures/agentless/agentless-architecture.ts";
import { PromptBuilder } from "../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../src/llm/prompts/context-builder.ts";
import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import { LLM_CONFIG } from "../src/config/llm.ts";
import { StructuralPromptBuilder, type CrabRef } from "../src/grounding/structural-prompt-builder.ts";
import { ensureClone } from "../src/grounding/crab-repo-cache.ts";
import { buildStructuralContext } from "../src/grounding/structural-context.ts";

import { CampaignRunner, InMemoryManifestStore, ProgressReporter, RetryPolicy } from "../src/campaign/index.ts";
import type { BenchmarkDataset } from "../src/benchmark/index.ts";
import type { BenchmarkInstance } from "../src/benchmark/models/benchmark-instance.ts";
import type { GroundTruthIssue } from "../src/benchmark/models/ground-truth-issue.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import { GroundTruthEvaluator } from "../src/benchmark/ground-truth-evaluator.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";
import { JudgeScorePrecomputer } from "../src/benchmark/matching/judge-score-precomputer.ts";
import { DEFAULT_JUDGE_CONFIG } from "../src/benchmark/matching/judge-prompt.ts";
import { ProviderRateLimitError } from "../src/llm/errors.ts";

if (LLM_CONFIG.provider !== "bedrock") { console.error("crab-structural-eval needs the Bedrock provider (live)."); process.exit(1); }

const CRAB_JSONL = resolve(process.env.CRAB_JSONL ?? "data/benchmark/crab-stage4.jsonl");
const N = Math.max(1, Number(process.env.CRAB_N ?? 50));
const MAX_DIFF = Math.max(1, Number(process.env.CRAB_MAX_DIFF_KB ?? 40)) * 1024;
const STRUCTURAL = (process.env.STRUCTURAL ?? "0") === "1";
const RUNS_PER_INSTANCE = Math.max(1, Number(process.env.RUNS_PER_INSTANCE ?? 3));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_CONFIG.modelId;

const resolveLine = (c: { line?: number | null; original_line?: number | null; start_line?: number | null; original_start_line?: number | null; diff_hunk?: string }): number | undefined => {
  for (const v of [c.line, c.original_line, c.start_line, c.original_start_line]) if (typeof v === "number") return v;
  const m = c.diff_hunk?.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
  return m ? Number(m[1]) : undefined;
};

const rows = readFileSync(CRAB_JSONL, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, any>);
const instances: BenchmarkInstance[] = [];
const refByInstance = new Map<string, CrabRef>();
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
  instances.push({ instanceId: r.instance_id, title: r.instance_id, source: "swe-prbench", rawDiff: diff, groundTruth: gt });
  refByInstance.set(r.instance_id, { repo: r.repo, baseCommit: r.base_commit });
  if (instances.length >= N) break;
}
console.log(`CRAB structural-eval — ${STRUCTURAL ? "STRUCTURAL" : "diff-only"}; ${instances.length} PRs (≤${MAX_DIFF / 1024}KB), ${RUNS_PER_INSTANCE} run(s), model ${LLM_CONFIG.defaultModel} @ ${LLM_CONFIG.region}`);

// Pre-clone (warm cache) + report structural context sizes so a slow first clone
// never stalls generation, and the token cost is logged up front.
if (STRUCTURAL) {
  const repos = [...new Set([...refByInstance.values()].map((r) => r.repo))];
  console.log(`pre-cloning ${repos.length} repos (blobless)...`);
  let okRepos = 0;
  for (const repo of repos) if (ensureClone(repo)) okRepos += 1; else console.log(`  clone FAILED: ${repo}`);
  let toks = 0; let withCtx = 0;
  for (const inst of instances) {
    const ref = refByInstance.get(inst.instanceId)!;
    const paths = inst.rawDiff.split("\n").filter((l) => l.startsWith("+++ ")).map((l) => l.slice(4).replace(/^b\//, "").trim()).filter((p) => p !== "/dev/null");
    const ctx = buildStructuralContext(ref.repo, ref.baseCommit, [...new Set(paths)]);
    if (ctx.text) { toks += ctx.tokensApprox; withCtx += 1; }
  }
  console.log(`  ${okRepos}/${repos.length} repos cloned; structural context on ${withCtx}/${instances.length} PRs, mean ~${Math.round(toks / Math.max(1, withCtx))} tok`);
}

const dataset: BenchmarkDataset = { datasetId: "crab-structural", name: "CRAB structural", source: "swe-prbench", instances };
const provider = new BedrockProvider();
const loaderDeps = { loader: new PromptLoader(), contextBuilder: new ContextBuilder() };
const promptBuilder = STRUCTURAL
  ? new StructuralPromptBuilder({ ...loaderDeps, resolveRef: (snap) => refByInstance.get(snap.title) })
  : new PromptBuilder(loaderDeps);
const snapshots = new InMemorySnapshotRepository();
const rawDiffStorage = new InMemoryRawDiffStorage();
const registry = new InMemoryArchitectureRegistry();
registry.register(new AgentlessArchitecture({ provider, promptBuilder, rawDiffStorage }));
const importCtx = createPRImportService({ snapshots, rawDiffStorage });
const experimentCtx = createExperimentService({ snapshots, registry });
const runner = new CampaignRunner({
  importService: importCtx.service,
  experimentService: experimentCtx.service,
  storage: experimentCtx.storage,
  reporter: new ProgressReporter({ sink: (line) => console.log(line) }),
  manifestStore: new InMemoryManifestStore(),
  retryPolicy: new RetryPolicy(6),
});

const report = await runner.run([dataset], {
  campaignId: `crab-${STRUCTURAL ? "structural" : "diffonly"}`,
  architectures: ["agentless"],
  runsPerInstance: RUNS_PER_INSTANCE,
  modelVersion: LLM_CONFIG.defaultModel,
  promptVersion: "v1",
  workflowVersion: "workflow-v1",
  evaluationVersion: "eval-v1",
  platformVersion: "v1.0.0",
  awsRegion: LLM_CONFIG.region,
  generatedAt: new Date().toISOString(),
});
const runs: BenchmarkRun[] = report.outcomes.map((o) => o.benchmarkRun);
if (process.env.RUNS_OUT) {
  mkdirSync(dirname(resolve(process.env.RUNS_OUT)), { recursive: true });
  writeFileSync(process.env.RUNS_OUT, JSON.stringify(runs, null, 2));
  console.log(`persisted ${runs.length} runs → ${process.env.RUNS_OUT}`);
}

const cache = new SemanticScoreCache();
console.log(`\nJUDGE — ${JUDGE_MODEL} over candidate pairs...`);
const precomputer = new JudgeScorePrecomputer(provider, { ...DEFAULT_JUDGE_CONFIG, modelId: JUDGE_MODEL });
for (let attempt = 1; attempt <= 8; attempt += 1) {
  try { await precomputer.precompute(runs, cache); break; }
  catch (error) {
    if (error instanceof ProviderRateLimitError && attempt < 8) {
      if (process.env.CACHE_OUT) { mkdirSync(dirname(resolve(process.env.CACHE_OUT)), { recursive: true }); writeFileSync(process.env.CACHE_OUT, JSON.stringify(cache.toJSON(), null, 2)); }
      const waitMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
      console.log(`  rate limited (${attempt}/8); backing off ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    throw error;
  }
}
if (process.env.CACHE_OUT) {
  mkdirSync(dirname(resolve(process.env.CACHE_OUT)), { recursive: true });
  writeFileSync(process.env.CACHE_OUT, JSON.stringify(cache.toJSON(), null, 2));
  console.log(`persisted judge cache → ${process.env.CACHE_OUT}`);
}

const strict = new GroundTruthEvaluator();
const semantic = new GroundTruthEvaluator({ matcher: new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(cache), semanticThreshold: TAU }) });
const macro = (rs: { precision: number; recall: number; f1: number }[]) => { const n = rs.length || 1; return { p: rs.reduce((a, x) => a + x.precision, 0) / n, r: rs.reduce((a, x) => a + x.recall, 0) / n, f1: rs.reduce((a, x) => a + x.f1, 0) / n }; };
const s = macro(runs.map((r) => strict.evaluate(r)));
const m = macro(runs.map((r) => semantic.evaluate(r)));
console.log(`\n=== CRAB agentless (${STRUCTURAL ? "STRUCTURAL" : "diff-only"}) — n=${runs.length} runs ===`);
console.log(`  strict   P=${s.p.toFixed(2)} R=${s.r.toFixed(2)} F1=${s.f1.toFixed(2)}`);
console.log(`  semantic P=${m.p.toFixed(2)} R=${m.r.toFixed(2)} F1=${m.f1.toFixed(2)} (τ=${TAU})`);
console.log(`\nRun the OTHER condition, then scripts/crab-analysis.ts for the paired diff-only vs structural comparison.`);
