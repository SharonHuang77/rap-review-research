/**
 * Grounding arm (doc 13) — GENERATE the grounded half of the pilot. A focused
 * fork of `benchmark-judge-eval.ts`: same live generate → Llama judge →
 * strict/semantic evaluate flow, but (a) the prompt builder is a
 * `GroundingPromptBuilder` that prepends the repo's ProjectConventions to the
 * review input, (b) instances are filtered to ONE repo's pilot subset (so the
 * fixed-repo conventions are always correct — no per-snapshot resolution), and
 * (c) only the grounded arms {agentless, hierarchical} are run. The UNGROUNDED
 * baseline is NOT regenerated — it is reused from the cached confirmatory
 * `phase2-results/qodo-all-runs.json`, byte-identical.
 *
 * Run once per pilot repo (Ghost, aspnetcore). Needs live Bedrock + the SAME SUT
 * model as the confirmatory campaign (Haiku 4.5) for a clean comparison:
 *   LLM_DEFAULT_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0 \
 *   AWS_PROFILE=bedrock GROUNDING_REPO=Ghost RUNS_PER_INSTANCE=3 \
 *   RUNS_OUT=grounding-pilot/Ghost-runs.json CACHE_OUT=grounding-pilot/Ghost-cache.json \
 *   node scripts/grounding-judge-eval.ts
 *
 * Env: GROUNDING_REPO (Ghost|aspnetcore, required), BENCHMARK_DATA_DIR,
 *      RUNS_PER_INSTANCE (=3), SEMANTIC_THRESHOLD (=0.7), JUDGE_MODEL,
 *      RUNS_OUT, CACHE_OUT, RUNS_RESUME_IN, PILOT_IDS (override the default set).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

import { createPRImportService } from "../src/services/snapshot/index.ts";
import { createExperimentService } from "../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../src/architectures/in-memory-architecture-registry.ts";
import { AgentlessArchitecture } from "../src/architectures/agentless/agentless-architecture.ts";
import { createHierarchicalArchitecture } from "../src/architectures/hierarchical/index.ts";
import { PromptBuilder } from "../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../src/llm/prompts/context-builder.ts";
import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import { LLM_CONFIG } from "../src/config/llm.ts";
import { GroundingPromptBuilder } from "../src/grounding/grounding-prompt-builder.ts";
import { PROJECT_CONVENTIONS, repoOfInstance } from "../src/grounding/project-conventions.ts";

import { BenchmarkLoader } from "../src/campaign/index.ts";
import { CampaignRunner, InMemoryManifestStore, ProgressReporter, RetryPolicy } from "../src/campaign/index.ts";
import type { BenchmarkDataset } from "../src/benchmark/index.ts";
import type { ReviewArchitecture } from "../src/models/experiment.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import { GroundTruthEvaluator } from "../src/benchmark/ground-truth-evaluator.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";
import { JudgeScorePrecomputer } from "../src/benchmark/matching/judge-score-precomputer.ts";
import { DEFAULT_JUDGE_CONFIG } from "../src/benchmark/matching/judge-prompt.ts";
import { ProviderRateLimitError } from "../src/llm/errors.ts";

if (LLM_CONFIG.provider !== "bedrock") {
  console.error("grounding-judge-eval needs the Bedrock provider (live). Unset LLM_PROVIDER=mock.");
  process.exit(1);
}

const REPO = process.env.GROUNDING_REPO;
if (!REPO || !PROJECT_CONVENTIONS[REPO]) {
  console.error(`GROUNDING_REPO must be one of: ${Object.keys(PROJECT_CONVENTIONS).join(", ")}`);
  process.exit(1);
}
const DATA_DIR = resolve(process.env.BENCHMARK_DATA_DIR ?? "data/benchmark");
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_CONFIG.modelId;
const RUNS_PER_INSTANCE = Math.max(1, Number(process.env.RUNS_PER_INSTANCE ?? 3));
// GROUNDED=0 generates the UNGROUNDED baseline (base PromptBuilder) — needed when
// the SUT model has no cached ungrounded runs (e.g. the Sonnet capability probe).
const GROUNDED = (process.env.GROUNDED ?? "1") !== "0";
const ARCHS: ReviewArchitecture[] = (process.env.ARMS ?? "agentless,hierarchical")
  .split(",").map((s) => s.trim()).filter(Boolean) as ReviewArchitecture[];

const DEFAULT_PILOT = new Set([
  "aspnetcore-pr-1", "aspnetcore-pr-2", "aspnetcore-pr-3", "aspnetcore-pr-4", "aspnetcore-pr-5", "aspnetcore-pr-6", "aspnetcore-pr-7",
  "Ghost-pr-1", "Ghost-pr-2", "Ghost-pr-3", "Ghost-pr-4", "Ghost-pr-5", "Ghost-pr-6", "Ghost-pr-7", "Ghost-pr-8", "Ghost-pr-9", "Ghost-pr-10", "Ghost-pr-11", "Ghost-pr-12", "Ghost-pr-13",
]);
const PILOT = process.env.PILOT_IDS
  ? new Set(process.env.PILOT_IDS.split(",").map((s) => s.trim()).filter(Boolean))
  : DEFAULT_PILOT;

const provider = new BedrockProvider();
const loader = new BenchmarkLoader();
const qodoPath = resolve(DATA_DIR, "qodo.json");
if (!existsSync(qodoPath)) {
  console.error(`No qodo.json under ${DATA_DIR}.`);
  process.exit(1);
}
const full = loader.loadQodo(JSON.parse(readFileSync(qodoPath, "utf8")));
const instances = full.instances.filter((i) => PILOT.has(i.instanceId) && repoOfInstance(i.instanceId) === REPO);
if (instances.length === 0) {
  console.error(`No pilot instances for repo=${REPO} in ${qodoPath}. Found ids e.g. ${full.instances.slice(0, 3).map((i) => i.instanceId).join(", ")}`);
  process.exit(1);
}
const dataset: BenchmarkDataset = { ...full, instances };
console.log(`${GROUNDED ? "GROUNDED" : "UNGROUNDED"} generation — repo=${REPO}, ${instances.length} pilot PRs, arms=${ARCHS.join("+")}, ${RUNS_PER_INSTANCE} run(s)/instance`);
console.log(`  model ${LLM_CONFIG.defaultModel} @ ${LLM_CONFIG.region}; conventions=${GROUNDED ? PROJECT_CONVENTIONS[REPO]!.length : 0}`);

// Fixed-repo grounding: every instance in this pass is the same repo. GROUNDED=0
// falls back to the base builder for a matched ungrounded baseline on this model.
const loaderDeps = { loader: new PromptLoader(), contextBuilder: new ContextBuilder() };
const promptBuilder = GROUNDED
  ? new GroundingPromptBuilder({ ...loaderDeps, resolveRepo: () => REPO })
  : new PromptBuilder(loaderDeps);
const snapshots = new InMemorySnapshotRepository();
const rawDiffStorage = new InMemoryRawDiffStorage();
const registry = new InMemoryArchitectureRegistry();
registry.register(new AgentlessArchitecture({ provider, promptBuilder, rawDiffStorage }));
registry.register(createHierarchicalArchitecture({ provider, promptBuilder, rawDiffStorage }));
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
  campaignId: `grounding-${REPO}`,
  architectures: ARCHS,
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
  console.log(`persisted ${runs.length} grounded runs → ${process.env.RUNS_OUT}`);
}

// Judge pass so semantic matching works on the new grounded findings.
const cache = new SemanticScoreCache();
console.log(`\nJUDGE — ${JUDGE_MODEL} over grounded candidate pairs...`);
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

const semantic = new GroundTruthEvaluator({
  matcher: new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(cache), semanticThreshold: TAU }),
});
console.log(`\n=== grounded ${REPO} per-arm macro (semantic τ=${TAU}) ===`);
for (const arch of ARCHS) {
  const rs = runs.filter((r) => r.architecture === arch).map((r) => semantic.evaluate(r));
  const n = rs.length || 1;
  console.log(`${arch.padEnd(14)} n=${rs.length}  P=${(rs.reduce((a, x) => a + x.precision, 0) / n).toFixed(2)} R=${(rs.reduce((a, x) => a + x.recall, 0) / n).toFixed(2)} F1=${(rs.reduce((a, x) => a + x.f1, 0) / n).toFixed(2)}`);
}
console.log(`\nDone. Ungrounded baseline is reused from phase2-results/qodo-all-runs.json — run scripts/grounding-analysis.ts for the diff-in-diff.`);
