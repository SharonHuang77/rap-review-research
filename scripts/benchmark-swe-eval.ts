/**
 * SWE-PRBench semantic coverage (experiment E2) — generate the four arms on the
 * Martian golden-comment set, judge findings against location-less human
 * comments ("same underlying issue?"), and report coverage/precision/F1 per arm.
 *
 * Run with: `npm run swe:eval`   (Bedrock; smoke-test first: `npm run smoke:bedrock`)
 * Env: BENCHMARK_DATA_DIR (=data/benchmark, reads swe.json), BENCHMARK_LIMIT (=1),
 *      JUDGE_MODEL (=DEFAULT_JUDGE_CONFIG.modelId), SEMANTIC_THRESHOLD (=0.7),
 *      RUNS_OUT / CACHE_OUT (persist for replay).
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
import { ProviderRateLimitError, ProviderTimeoutError } from "../src/llm/errors.ts";

import { CampaignRunner, InMemoryManifestStore, ProgressReporter, RetryPolicy } from "../src/campaign/index.ts";
import type { BenchmarkDataset, BenchmarkInstance } from "../src/benchmark/index.ts";
import type { GoldenComment } from "../src/benchmark/models/golden-comment.ts";
import { SweGoldenAdapter } from "../src/benchmark/adapters/swe-golden-adapter.ts";
import { CoverageScoreCache } from "../src/benchmark/matching/coverage-score-cache.ts";
import { CoverageJudgePrecomputer } from "../src/benchmark/matching/coverage-judge-precomputer.ts";
import { DEFAULT_JUDGE_CONFIG } from "../src/benchmark/matching/judge-prompt.ts";
import { SemanticCoverageEvaluator, type SemanticCoverageResult } from "../src/benchmark/semantic-coverage-evaluator.ts";

if (LLM_CONFIG.provider !== "bedrock") {
  console.error("swe:eval needs the Bedrock provider (live). Unset LLM_PROVIDER=mock.");
  process.exit(1);
}

const DATA_DIR = resolve(process.env.BENCHMARK_DATA_DIR ?? "data/benchmark");
const LIMIT = Math.max(1, Number(process.env.BENCHMARK_LIMIT ?? 1));
// Chunked/resumable runs: process instances [OFFSET, OFFSET+LIMIT).
const OFFSET = Math.max(0, Number(process.env.BENCHMARK_OFFSET ?? 0));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_CONFIG.modelId;

// `swe-golden.json` is the Martian golden-comment dataset (location-less),
// distinct from the legacy file+line `swe.json` sample that campaign:live /
// judge:eval load via the old SWEPRBenchAdapter — different shapes, so they must
// not share a filename.
const swePath = resolve(DATA_DIR, "swe-golden.json");
if (!existsSync(swePath)) {
  console.error(`No swe-golden.json under ${DATA_DIR}. See data/benchmark/README.md.`);
  process.exit(1);
}
const sweDataset = new SweGoldenAdapter().toDataset(JSON.parse(readFileSync(swePath, "utf8")));
const instances = sweDataset.instances.slice(OFFSET, OFFSET + LIMIT);
if (instances.length === 0) {
  console.error(`No instances in ${swePath} (after BENCHMARK_LIMIT=${LIMIT}).`);
  process.exit(1);
}
const commentsByInstance = new Map<string, GoldenComment[]>(
  instances.map((i) => [i.instanceId, i.goldenComments]),
);

// BenchmarkDataset for generation: SWE has no located ground truth (empty).
const genDataset: BenchmarkDataset = {
  datasetId: "swe-prbench",
  name: sweDataset.name,
  source: "swe-prbench",
  instances: instances.map(
    (i): BenchmarkInstance => ({
      instanceId: i.instanceId,
      title: i.title,
      source: "swe-prbench",
      rawDiff: i.rawDiff,
      groundTruth: [],
    }),
  ),
};

const provider = new BedrockProvider();
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
  // More attempts + exponential backoff to ride out Bedrock throttling.
  retryPolicy: new RetryPolicy(6),
});

console.log(`SWE coverage — model ${LLM_CONFIG.defaultModel} @ ${LLM_CONFIG.region}, ${instances.length} PR(s)\n`);
const report = await runner.run([genDataset], {
  campaignId: "swe-eval",
  architectures: ["agentless", "generalists-3", "hierarchical", "consensus"],
  // Registered protocol (pre-reg §3.3): 3 runs/instance for the confirmatory
  // campaign. Default 1 for cheap pilots; set RUNS_PER_INSTANCE=3.
  runsPerInstance: Math.max(1, Number(process.env.RUNS_PER_INSTANCE ?? 1)),
  modelVersion: LLM_CONFIG.defaultModel,
  promptVersion: "v1",
  workflowVersion: "workflow-v1",
  evaluationVersion: "eval-v1",
  platformVersion: "v1.0.0",
  awsRegion: LLM_CONFIG.region,
  generatedAt: new Date().toISOString(),
});
const runs = report.outcomes.map((o) => o.benchmarkRun);
if (process.env.RUNS_OUT) writeFileSync(process.env.RUNS_OUT, JSON.stringify(runs, null, 2));

// Judge (with rate-limit backoff, mirroring judge:eval) → coverage cache.
const cache = new CoverageScoreCache();
const precomputer = new CoverageJudgePrecomputer(provider, { ...DEFAULT_JUDGE_CONFIG, modelId: JUDGE_MODEL });
console.log(`\nJUDGE — ${JUDGE_MODEL} over (finding × golden comment) pairs...`);
const maxAttempts = 8;
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    await precomputer.precompute(runs, commentsByInstance, cache);
    break;
  } catch (error) {
    const transient = error instanceof ProviderRateLimitError || error instanceof ProviderTimeoutError;
    if (transient && attempt < maxAttempts) {
      const waitMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
      // Checkpoint so partial judge progress survives; precompute resumes via cache.has.
      if (process.env.CACHE_OUT) writeFileSync(process.env.CACHE_OUT, JSON.stringify(cache.toJSON(), null, 2));
      const kind = error instanceof ProviderRateLimitError ? "rate limited" : "timed out";
      console.log(`  judge ${kind} (attempt ${attempt}/${maxAttempts}); backing off ${waitMs}ms and resuming...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    // Non-transient (or attempts exhausted): persist progress before failing.
    if (process.env.CACHE_OUT) writeFileSync(process.env.CACHE_OUT, JSON.stringify(cache.toJSON(), null, 2));
    throw error;
  }
}
if (process.env.CACHE_OUT) writeFileSync(process.env.CACHE_OUT, JSON.stringify(cache.toJSON(), null, 2));

// Aggregate per architecture (macro mean over instances).
const evaluator = new SemanticCoverageEvaluator(TAU);
console.log(`\n=== SWE coverage (judge τ=${TAU}) ===`);
console.log("arch".padEnd(14) + "  n   coverage  precision   f1    unmatched(≈beyond-human)");
for (const arch of ["agentless", "generalists-3", "hierarchical", "consensus"]) {
  const armRuns = runs.filter((r) => r.architecture === arch);
  if (armRuns.length === 0) continue;
  const results: SemanticCoverageResult[] = armRuns.map((r) =>
    evaluator.evaluate(r.producedFindings, commentsByInstance.get(r.instanceId) ?? [], cache),
  );
  const mean = (pick: (x: SemanticCoverageResult) => number): number =>
    results.reduce((a, x) => a + pick(x), 0) / (results.length || 1);
  const unmatched = results.reduce((a, x) => a + (x.uniqueFindingCount - x.matchedFindings), 0);
  console.log(
    arch.padEnd(14) +
      `  ${armRuns.length}   ${mean((x) => x.coverage).toFixed(2)}      ` +
      `${mean((x) => x.precision).toFixed(2)}      ${mean((x) => x.f1).toFixed(2)}   ${unmatched}`,
  );
}
