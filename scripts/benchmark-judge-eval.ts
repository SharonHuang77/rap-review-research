/**
 * A2 re-evaluation — strict (file+line) vs semantic (LLM-judge) matching.
 *
 * Run with: `npm run judge:eval`
 *
 * The strict file+line matcher counts a produced finding as a true positive only
 * when it lands on (near) the ground-truth line. That understates the
 * multi-agent arms, which phrase/relocate the same issue. This script applies
 * A2 (Approach A): generate the ladder live, run a **non-Anthropic Bedrock
 * judge** (Llama, a different family than the Claude systems under test) over
 * the candidate pairs into a persisted `SemanticScoreCache`, then evaluate the
 * SAME runs twice — strict and semantic (`score >= τ`) — and print the delta.
 *
 * Replayable: the judge cache and the raw runs are written to disk, so τ can be
 * retuned with `CACHE_IN=... RUNS_IN=...` at zero generation/judge cost.
 *
 * Env:
 *   BENCHMARK_DATA_DIR (=data/benchmark), BENCHMARK_LIMIT (=1 per dataset)
 *   LLM_DEFAULT_MODEL / LLM_REGION  — the systems under test (see config/llm.ts)
 *   JUDGE_MODEL (=DEFAULT_JUDGE_CONFIG.modelId) — the non-Anthropic judge
 *   SEMANTIC_THRESHOLD (=0.7) — τ, the semantic rescue cutoff
 *   RUNS_IN / RUNS_OUT, CACHE_IN / CACHE_OUT — replay artifacts (JSON)
 *   Smoke-test Bedrock first: `npm run smoke:bedrock`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createPRImportService } from "../src/services/snapshot/index.ts";
import { createExperimentService } from "../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../src/architectures/in-memory-architecture-registry.ts";
import { AgentlessArchitecture } from "../src/architectures/agentless/agentless-architecture.ts";
import { createGeneralistsArchitecture } from "../src/architectures/generalists/index.ts";
import { createHierarchicalArchitecture } from "../src/architectures/hierarchical/index.ts";
import { createConsensusArchitecture } from "../src/architectures/consensus/index.ts";
import { PromptBuilder } from "../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../src/llm/prompts/context-builder.ts";
import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import { LLM_CONFIG } from "../src/config/llm.ts";

import { BenchmarkLoader } from "../src/campaign/index.ts";
import { CampaignRunner, InMemoryManifestStore, ProgressReporter, RetryPolicy } from "../src/campaign/index.ts";
import type { BenchmarkDataset } from "../src/benchmark/index.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { BenchmarkResult } from "../src/benchmark/models/benchmark-result.ts";
import { GroundTruthEvaluator } from "../src/benchmark/ground-truth-evaluator.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";
import { JudgeScorePrecomputer } from "../src/benchmark/matching/judge-score-precomputer.ts";
import { DEFAULT_JUDGE_CONFIG } from "../src/benchmark/matching/judge-prompt.ts";
import { ProviderRateLimitError } from "../src/llm/errors.ts";

if (LLM_CONFIG.provider !== "bedrock") {
  console.error("judge:eval needs the Bedrock provider (live). Unset LLM_PROVIDER=mock.");
  process.exit(1);
}

const DATA_DIR = resolve(process.env.BENCHMARK_DATA_DIR ?? "data/benchmark");
const LIMIT = Math.max(1, Number(process.env.BENCHMARK_LIMIT ?? 1));
// Chunked/resumable runs: process instances [OFFSET, OFFSET+LIMIT) so a long
// campaign can be split into token-sized chunks (shared CACHE accumulates).
const OFFSET = Math.max(0, Number(process.env.BENCHMARK_OFFSET ?? 0));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_CONFIG.modelId;

const provider = new BedrockProvider();

// --- 1. Runs: load persisted (replay) or generate the ladder live ------------
let runs: BenchmarkRun[];
if (process.env.RUNS_IN && existsSync(process.env.RUNS_IN)) {
  runs = JSON.parse(readFileSync(process.env.RUNS_IN, "utf8")) as BenchmarkRun[];
  console.log(`loaded ${runs.length} runs from ${process.env.RUNS_IN} (skipping generation)`);
} else {
  const loader = new BenchmarkLoader();
  const datasets: BenchmarkDataset[] = [];
  const qodoPath = resolve(DATA_DIR, "qodo.json");
  if (existsSync(qodoPath)) {
    datasets.push(subset(loader.loadQodo(JSON.parse(readFileSync(qodoPath, "utf8"))), LIMIT, OFFSET));
  }
  const swePath = resolve(DATA_DIR, "swe.json");
  if (existsSync(swePath)) {
    datasets.push(subset(loader.loadSwe(JSON.parse(readFileSync(swePath, "utf8"))), LIMIT, OFFSET));
  }
  if (datasets.length === 0) {
    console.error(`No datasets under ${DATA_DIR}. See src/benchmark/README.md.`);
    process.exit(1);
  }

  const promptBuilder = new PromptBuilder({ loader: new PromptLoader(), contextBuilder: new ContextBuilder() });
  const snapshots = new InMemorySnapshotRepository();
  const rawDiffStorage = new InMemoryRawDiffStorage();
  const registry = new InMemoryArchitectureRegistry();
  registry.register(new AgentlessArchitecture({ provider, promptBuilder, rawDiffStorage }));
  registry.register(createGeneralistsArchitecture({ provider, promptBuilder, rawDiffStorage }));
  registry.register(createHierarchicalArchitecture({ provider, promptBuilder, rawDiffStorage }));
  registry.register(createConsensusArchitecture({ provider, promptBuilder, rawDiffStorage }));
  const importCtx = createPRImportService({ snapshots, rawDiffStorage });
  const experimentCtx = createExperimentService({ snapshots, registry });
  const runner = new CampaignRunner({
    importService: importCtx.service,
    experimentService: experimentCtx.service,
    storage: experimentCtx.storage,
    reporter: new ProgressReporter({ sink: (line) => console.log(line) }),
    manifestStore: new InMemoryManifestStore(),
    // More attempts + exponential backoff to ride out Bedrock throttling on a
    // long campaign (default 3 was too few under sustained load).
    retryPolicy: new RetryPolicy(6),
  });

  console.log(`GENERATE — model ${LLM_CONFIG.defaultModel} @ ${LLM_CONFIG.region}\n`);
  const report = await runner.run(datasets, {
    campaignId: "judge-eval",
    architectures: ["agentless", "generalists-3", "hierarchical", "consensus"],
    // Registered protocol (pre-reg §3.3, freeze manifest): 3 runs/instance for
    // the confirmatory campaign. Default 1 for cheap pilots; set RUNS_PER_INSTANCE=3.
    runsPerInstance: Math.max(1, Number(process.env.RUNS_PER_INSTANCE ?? 1)),
    modelVersion: LLM_CONFIG.defaultModel,
    promptVersion: "v1",
    workflowVersion: "workflow-v1",
    evaluationVersion: "eval-v1",
    platformVersion: "v1.0.0",
    awsRegion: LLM_CONFIG.region,
    generatedAt: new Date().toISOString(),
  });
  runs = report.outcomes.map((o) => o.benchmarkRun);
  if (process.env.RUNS_OUT) {
    writeFileSync(process.env.RUNS_OUT, JSON.stringify(runs, null, 2));
    console.log(`\npersisted ${runs.length} runs → ${process.env.RUNS_OUT}`);
  }
}

// --- 2. Judge: fill the semantic score cache (or load a persisted one) --------
let cache: SemanticScoreCache;
if (process.env.CACHE_IN && existsSync(process.env.CACHE_IN)) {
  cache = SemanticScoreCache.fromJSON(JSON.parse(readFileSync(process.env.CACHE_IN, "utf8")));
  console.log(`loaded judge cache from ${process.env.CACHE_IN} (skipping judge calls)`);
} else {
  cache = new SemanticScoreCache();
  console.log(`\nJUDGE — ${JUDGE_MODEL} over candidate pairs (same file, no line overlap)...`);
  const precomputer = new JudgeScorePrecomputer(provider, { ...DEFAULT_JUDGE_CONFIG, modelId: JUDGE_MODEL });
  // Bedrock throttles bursts; the precomputer is resumable (skips cached pairs),
  // so on a rate limit we checkpoint the cache, back off, and resume. Needed for
  // large runs (the full campaign would otherwise die mid-judge).
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await precomputer.precompute(runs, cache);
      break;
    } catch (error) {
      if (error instanceof ProviderRateLimitError && attempt < maxAttempts) {
        const waitMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
        if (process.env.CACHE_OUT) {
          writeFileSync(process.env.CACHE_OUT, JSON.stringify(cache.toJSON(), null, 2));
        }
        console.log(`  rate limited (attempt ${attempt}/${maxAttempts}); backing off ${waitMs}ms and resuming...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw error;
    }
  }
  if (process.env.CACHE_OUT) {
    writeFileSync(process.env.CACHE_OUT, JSON.stringify(cache.toJSON(), null, 2));
    console.log(`persisted judge cache → ${process.env.CACHE_OUT}`);
  }
}
const cacheSize = Object.keys(cache.toJSON()).length;

// --- 3. Evaluate twice: strict vs semantic (score >= τ) -----------------------
const strict = new GroundTruthEvaluator();
const semantic = new GroundTruthEvaluator({
  matcher: new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(cache), semanticThreshold: TAU }),
});
const strictResults = runs.map((r) => strict.evaluate(r));
const semanticResults = runs.map((r) => semantic.evaluate(r));

// --- 4. Per-architecture macro means, strict vs semantic ----------------------
console.log(`\n=== strict (file+line) vs semantic (judge τ=${TAU}) — judge pairs scored: ${cacheSize} ===`);
console.log("arch".padEnd(14) + "  n   P(s)→P(sem)   R(s)→R(sem)   F1(s)→F1(sem)");
for (const arch of ["agentless", "generalists-3", "hierarchical", "consensus"]) {
  const idx = runs.map((r, i) => (r.architecture === arch ? i : -1)).filter((i) => i >= 0);
  if (idx.length === 0) continue;
  const s = macro(idx.map((i) => strictResults[i]));
  const m = macro(idx.map((i) => semanticResults[i]));
  console.log(
    arch.padEnd(14) +
      `  ${idx.length}   ` +
      `${s.p.toFixed(2)}→${m.p.toFixed(2)}     ` +
      `${s.r.toFixed(2)}→${m.r.toFixed(2)}     ` +
      `${s.f1.toFixed(2)}→${m.f1.toFixed(2)}`,
  );
}

function macro(results: BenchmarkResult[]): { p: number; r: number; f1: number } {
  const n = results.length || 1;
  return {
    p: results.reduce((a, x) => a + x.precision, 0) / n,
    r: results.reduce((a, x) => a + x.recall, 0) / n,
    f1: results.reduce((a, x) => a + x.f1, 0) / n,
  };
}

function subset(dataset: BenchmarkDataset, limit: number, offset = 0): BenchmarkDataset {
  return { ...dataset, instances: dataset.instances.slice(offset, offset + limit) };
}
