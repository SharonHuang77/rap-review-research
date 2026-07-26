/**
 * Module-agent review eval (doc-17, Phase 1). Tests review-by-code-structure:
 * partition each Qodo PR's diff into per-module sub-diffs, review EACH module with
 * its own agent (agentless, one model), then union the module findings into a
 * per-PR review. Compared (in module-agent-analysis.ts) against the whole-PR
 * single reviewer (A0 = the frozen Haiku agentless in phase2-results/qodo-all).
 *
 * Isolates the module-decomposition axis (same model, same total diff, split by
 * module vs not). EXPLORATORY; not the registered confirmatory; ungrounded base
 * builder (byte-identical generation per slice).
 *
 * Run: AWS_PROFILE=bedrock MOD_N=50 RUNS_PER_INSTANCE=3 \
 *   RUNS_OUT=module-arm/union-runs.json CACHE_OUT=module-arm/union-cache.json \
 *   SUBRUNS_OUT=module-arm/subruns.json node scripts/module-agent-eval.ts
 * Env: MOD_N (=50), RUNS_PER_INSTANCE (=3), LLM_DEFAULT_MODEL (Haiku default),
 *      JUDGE_MODEL, SEMANTIC_THRESHOLD (=0.7), BENCHMARK_DATA_DIR, RUNS_OUT,
 *      CACHE_OUT, SUBRUNS_OUT.
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
import { partitionDiffByModule, moduleOf } from "../src/architectures/module-partition.ts";
import { areDuplicateFindings } from "../src/architectures/shared/finding-dedup.ts";

import { BenchmarkLoader, CampaignRunner, InMemoryManifestStore, ProgressReporter, RetryPolicy } from "../src/campaign/index.ts";
import type { BenchmarkDataset } from "../src/benchmark/index.ts";
import type { BenchmarkInstance } from "../src/benchmark/models/benchmark-instance.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import { GroundTruthEvaluator } from "../src/benchmark/ground-truth-evaluator.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";
import { JudgeScorePrecomputer } from "../src/benchmark/matching/judge-score-precomputer.ts";
import { DEFAULT_JUDGE_CONFIG } from "../src/benchmark/matching/judge-prompt.ts";
import { ProviderRateLimitError } from "../src/llm/errors.ts";

if (LLM_CONFIG.provider !== "bedrock") { console.error("module-agent-eval needs the Bedrock provider (live)."); process.exit(1); }

const DATA_DIR = resolve(process.env.BENCHMARK_DATA_DIR ?? "data/benchmark");
const N = Math.max(1, Number(process.env.MOD_N ?? 50));
const RUNS_PER_INSTANCE = Math.max(1, Number(process.env.RUNS_PER_INSTANCE ?? 3));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_CONFIG.modelId;
const SEP = "@@mod@@";

const loader = new BenchmarkLoader();
const full = loader.loadQodo(JSON.parse(readFileSync(resolve(DATA_DIR, "qodo.json"), "utf8")));
// MOD_IDS (comma-separated instanceIds) restricts to a specific PR set — e.g. the
// multi-module-GT subset where module decomposition can actually differ from
// compute-matched sampling. Otherwise take the first N.
const MOD_IDS = process.env.MOD_IDS ? new Set(process.env.MOD_IDS.split(",").map((s) => s.trim()).filter(Boolean)) : undefined;
const prs = MOD_IDS ? full.instances.filter((i) => MOD_IDS.has(i.instanceId)) : full.instances.slice(0, N);

// SAMPLE_MATCH=1 is the compute-matched control: instead of K module SLICES, run
// K whole-PR SAMPLES (K = the PR's module count, so calls match module-union
// exactly). Diversity for the sample arm must come from temperature, so run it
// with LLM_TEMPERATURE=0.7 (module slices are diverse by input, so run at temp 0).
const SAMPLE_MATCH = process.env.SAMPLE_MATCH === "1";
const ARM = SAMPLE_MATCH ? "sample-union" : "module-union";

// Build sub-instances: one per (PR, module slice), or K whole-PR copies (control).
const subInstances: BenchmarkInstance[] = [];
const fullByPr = new Map<string, BenchmarkInstance>();
for (const pr of prs) {
  fullByPr.set(pr.instanceId, pr);
  const parts = partitionDiffByModule(pr.rawDiff);
  const K = Math.max(1, parts.size);
  if (SAMPLE_MATCH) {
    for (let j = 1; j <= K; j += 1) subInstances.push({ instanceId: `${pr.instanceId}${SEP}sample${j}`, title: `${pr.instanceId} · sample${j}`, source: pr.source, rawDiff: pr.rawDiff, groundTruth: pr.groundTruth });
  } else {
    for (const [mod, subDiff] of parts) {
      const gt = pr.groundTruth.filter((g) => moduleOf(g.file) === mod);
      subInstances.push({ instanceId: `${pr.instanceId}${SEP}${mod}`, title: `${pr.instanceId} · ${mod}`, source: pr.source, rawDiff: subDiff, groundTruth: gt });
    }
  }
}
console.log(`${ARM} eval — ${prs.length} PRs → ${subInstances.length} sub-instances (mean ${(subInstances.length / prs.length).toFixed(1)}/PR), ${RUNS_PER_INSTANCE} run(s), model ${LLM_CONFIG.defaultModel} @ ${LLM_CONFIG.region}, temp=${LLM_CONFIG.temperature}`);

const dataset: BenchmarkDataset = { ...full, datasetId: "qodo-module", instances: subInstances };
const provider = new BedrockProvider();
const promptBuilder = new PromptBuilder({ loader: new PromptLoader(), contextBuilder: new ContextBuilder() });
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
  campaignId: "qodo-module", architectures: ["agentless"], runsPerInstance: RUNS_PER_INSTANCE,
  modelVersion: LLM_CONFIG.defaultModel, promptVersion: "v1", workflowVersion: "workflow-v1",
  evaluationVersion: "eval-v1", platformVersion: "v1.0.0", awsRegion: LLM_CONFIG.region, generatedAt: new Date().toISOString(),
});
const subRuns: BenchmarkRun[] = report.outcomes.map((o) => o.benchmarkRun);
if (process.env.SUBRUNS_OUT) { mkdirSync(dirname(resolve(process.env.SUBRUNS_OUT)), { recursive: true }); writeFileSync(process.env.SUBRUNS_OUT, JSON.stringify(subRuns, null, 2)); }

// Aggregate: union each PR's module findings per run number (module-union arm).
const runNo = (r: BenchmarkRun): string => r.runId.split("#").pop() ?? "1";
const prOf = (r: BenchmarkRun): string => r.instanceId.split(SEP)[0]!;
function unionDedup(findings: ReviewFinding[]): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  for (const f of findings) if (!out.some((k) => areDuplicateFindings(k, f))) out.push(f);
  return out;
}
const grouped = new Map<string, ReviewFinding[]>(); // key pr#run
for (const r of subRuns) {
  const key = `${prOf(r)}#${runNo(r)}`;
  grouped.set(key, [...(grouped.get(key) ?? []), ...r.producedFindings]);
}
const unionRuns: BenchmarkRun[] = [];
for (const [key, findings] of grouped) {
  const [pr, k] = key.split("#");
  const parent = fullByPr.get(pr!)!;
  unionRuns.push({
    runId: `${pr}#${ARM}#${k}`, datasetId: "qodo-module", instanceId: pr!, snapshotId: `${pr}#${ARM}`,
    experimentId: `${pr}#${ARM}#${LLM_CONFIG.defaultModel}`, architecture: "agentless",
    producedFindings: unionDedup(findings), groundTruth: parent.groundTruth, rawDiff: parent.rawDiff,
  });
}
console.log(`aggregated ${subRuns.length} sub-runs → ${unionRuns.length} per-PR ${ARM} runs`);
if (process.env.RUNS_OUT) { mkdirSync(dirname(resolve(process.env.RUNS_OUT)), { recursive: true }); writeFileSync(process.env.RUNS_OUT, JSON.stringify(unionRuns, null, 2)); console.log(`persisted union runs → ${process.env.RUNS_OUT}`); }

// Judge over the union runs (semantic matching vs the full PR GT).
const cache = new SemanticScoreCache();
console.log(`\nJUDGE — ${JUDGE_MODEL} over module-union candidate pairs...`);
const precomputer = new JudgeScorePrecomputer(provider, { ...DEFAULT_JUDGE_CONFIG, modelId: JUDGE_MODEL });
for (let attempt = 1; attempt <= 8; attempt += 1) {
  try { await precomputer.precompute(unionRuns, cache); break; }
  catch (error) {
    if (error instanceof ProviderRateLimitError && attempt < 8) {
      if (process.env.CACHE_OUT) { mkdirSync(dirname(resolve(process.env.CACHE_OUT)), { recursive: true }); writeFileSync(process.env.CACHE_OUT, JSON.stringify(cache.toJSON(), null, 2)); }
      const waitMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
      console.log(`  rate limited (${attempt}/8); backing off ${waitMs}ms...`); await new Promise((r) => setTimeout(r, waitMs)); continue;
    }
    throw error;
  }
}
if (process.env.CACHE_OUT) { mkdirSync(dirname(resolve(process.env.CACHE_OUT)), { recursive: true }); writeFileSync(process.env.CACHE_OUT, JSON.stringify(cache.toJSON(), null, 2)); console.log(`persisted judge cache → ${process.env.CACHE_OUT}`); }

const semantic = new GroundTruthEvaluator({ matcher: new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(cache), semanticThreshold: TAU }) });
const rs = unionRuns.map((r) => semantic.evaluate(r));
const n = rs.length || 1;
console.log(`\n=== ${ARM} (semantic τ=${TAU}) — n=${rs.length} PR-runs ===`);
console.log(`  P=${(rs.reduce((a, x) => a + x.precision, 0) / n).toFixed(2)} R=${(rs.reduce((a, x) => a + x.recall, 0) / n).toFixed(2)} F1=${(rs.reduce((a, x) => a + x.f1, 0) / n).toFixed(2)}`);
console.log(`\nRun scripts/module-agent-analysis.ts for the paired A0 (whole-PR) vs module-union comparison, split by module-multiplicity.`);
