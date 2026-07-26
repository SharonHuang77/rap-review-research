/**
 * Error-type-specialist eval (doc-17). Runs one agentless "type specialist" per
 * error type (convention, functional) over the Qodo PRs — each told to report
 * ONLY its type — then unions them into a per-PR team. Compared (in
 * type-specialist-analysis.ts) against the generalist (qodo-all), the
 * compute-matched multi-sample baseline (ladder-haiku07), and the cross-family
 * union. The decisive question: does telling the model to focus on one type let
 * it recover MORE of that type than the generalist (attention), or is the blind
 * spot a recognition ceiling (focus won't help) — i.e. is role/type prompting a
 * real decorrelation source or ≈ the H2 null. EXPLORATORY; ungrounded base builder.
 *
 * Run: AWS_PROFILE=bedrock PILOT_IDS=<100 qodo ids> RUNS_PER_INSTANCE=1 \
 *   OUT_DIR=module-arm node scripts/type-specialist-eval.ts
 * Env: TYPES (=convention,functional), PILOT_IDS (required, the PR set),
 *      RUNS_PER_INSTANCE (=1), LLM_DEFAULT_MODEL (Haiku default), JUDGE_MODEL,
 *      SEMANTIC_THRESHOLD (=0.7), BENCHMARK_DATA_DIR, OUT_DIR (=module-arm).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

import { createPRImportService } from "../src/services/snapshot/index.ts";
import { createExperimentService } from "../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../src/architectures/in-memory-architecture-registry.ts";
import { AgentlessArchitecture } from "../src/architectures/agentless/agentless-architecture.ts";
import { PromptLoader } from "../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../src/llm/prompts/context-builder.ts";
import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import { LLM_CONFIG } from "../src/config/llm.ts";
import { TypeSpecialistPromptBuilder, TYPE_FOCI } from "../src/architectures/type-specialist-prompt-builder.ts";
import { areDuplicateFindings } from "../src/architectures/shared/finding-dedup.ts";

import { BenchmarkLoader, CampaignRunner, InMemoryManifestStore, ProgressReporter, RetryPolicy } from "../src/campaign/index.ts";
import type { BenchmarkDataset } from "../src/benchmark/index.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { JudgeScorePrecomputer } from "../src/benchmark/matching/judge-score-precomputer.ts";
import { DEFAULT_JUDGE_CONFIG } from "../src/benchmark/matching/judge-prompt.ts";
import { ProviderRateLimitError } from "../src/llm/errors.ts";

if (LLM_CONFIG.provider !== "bedrock") { console.error("type-specialist-eval needs the Bedrock provider (live)."); process.exit(1); }

const DATA_DIR = resolve(process.env.BENCHMARK_DATA_DIR ?? "data/benchmark");
const TYPES = (process.env.TYPES ?? "convention,functional").split(",").map((s) => s.trim()).filter(Boolean);
const RUNS_PER_INSTANCE = Math.max(1, Number(process.env.RUNS_PER_INSTANCE ?? 1));
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_CONFIG.modelId;
const OUT = process.env.OUT_DIR ?? "module-arm";
const PILOT = process.env.PILOT_IDS ? new Set(process.env.PILOT_IDS.split(",").map((s) => s.trim()).filter(Boolean)) : undefined;
if (!PILOT) { console.error("set PILOT_IDS (the PR set)"); process.exit(1); }

const full = new BenchmarkLoader().loadQodo(JSON.parse(readFileSync(resolve(DATA_DIR, "qodo.json"), "utf8")));
const prs = full.instances.filter((i) => PILOT.has(i.instanceId));
const dataset: BenchmarkDataset = { ...full, instances: prs };
console.log(`Type-specialist eval — ${prs.length} PRs, types=[${TYPES.join(", ")}], ${RUNS_PER_INSTANCE} run(s), model ${LLM_CONFIG.defaultModel} @ ${LLM_CONFIG.region}`);
mkdirSync(resolve(OUT), { recursive: true });

const provider = new BedrockProvider();
const loaderDeps = { loader: new PromptLoader(), contextBuilder: new ContextBuilder() };

async function runType(focus: string): Promise<BenchmarkRun[]> {
  const promptBuilder = new TypeSpecialistPromptBuilder({ ...loaderDeps, focus });
  const snapshots = new InMemorySnapshotRepository();
  const rawDiffStorage = new InMemoryRawDiffStorage();
  const registry = new InMemoryArchitectureRegistry();
  registry.register(new AgentlessArchitecture({ provider, promptBuilder, rawDiffStorage }));
  const importCtx = createPRImportService({ snapshots, rawDiffStorage });
  const experimentCtx = createExperimentService({ snapshots, registry });
  const runner = new CampaignRunner({
    importService: importCtx.service, experimentService: experimentCtx.service, storage: experimentCtx.storage,
    reporter: new ProgressReporter({ sink: (line) => console.log(line) }), manifestStore: new InMemoryManifestStore(), retryPolicy: new RetryPolicy(6),
  });
  const report = await runner.run([dataset], {
    campaignId: "qodo-typespec", architectures: ["agentless"], runsPerInstance: RUNS_PER_INSTANCE,
    modelVersion: LLM_CONFIG.defaultModel, promptVersion: "v1", workflowVersion: "workflow-v1",
    evaluationVersion: "eval-v1", platformVersion: "v1.0.0", awsRegion: LLM_CONFIG.region, generatedAt: new Date().toISOString(),
  });
  return report.outcomes.map((o) => o.benchmarkRun);
}

const perType = new Map<string, BenchmarkRun[]>();
for (const t of TYPES) {
  console.log(`\n--- type "${t}" ---`);
  const runs = await runType(TYPE_FOCI[t] ?? `## Review focus: ${t.toUpperCase()} ONLY`);
  perType.set(t, runs);
  writeFileSync(join(OUT, `type-spec-${t}-runs.json`), JSON.stringify(runs, null, 2));
}

// Team = per-PR union (dedup) across type specialists, aligned by run number.
const runNo = (r: BenchmarkRun): string => r.runId.split("#").pop() ?? "1";
const unionDedup = (fs: ReviewFinding[]): ReviewFinding[] => { const o: ReviewFinding[] = []; for (const f of fs) if (!o.some((k) => areDuplicateFindings(k, f))) o.push(f); return o; };
const grouped = new Map<string, { gt: BenchmarkRun["groundTruth"]; rawDiff?: string; findings: ReviewFinding[] }>();
for (const runs of perType.values()) for (const r of runs) {
  const key = `${r.instanceId}#${runNo(r)}`;
  const e = grouped.get(key) ?? { gt: r.groundTruth, rawDiff: r.rawDiff, findings: [] };
  e.findings.push(...r.producedFindings); grouped.set(key, e);
}
const team: BenchmarkRun[] = [...grouped.entries()].map(([key, e]) => {
  const [pr, k] = key.split("#");
  return { runId: `${pr}#type-team#${k}`, datasetId: "qodo-typespec", instanceId: pr!, snapshotId: `${pr}#type-team`, experimentId: `${pr}#type-team#${LLM_CONFIG.defaultModel}`, architecture: "agentless" as const, producedFindings: unionDedup(e.findings), groundTruth: e.gt, rawDiff: e.rawDiff };
});
writeFileSync(join(OUT, "type-spec-team-runs.json"), JSON.stringify(team, null, 2));
console.log(`\npersisted ${TYPES.length} per-type run sets + ${team.length} team runs → ${OUT}/type-spec-*`);

// Judge over every produced finding (per-type runs cover the team's too).
const cache = new SemanticScoreCache();
const allRuns = [...[...perType.values()].flat(), ...team];
console.log(`\nJUDGE — ${JUDGE_MODEL} over type-specialist candidate pairs...`);
const precomputer = new JudgeScorePrecomputer(provider, { ...DEFAULT_JUDGE_CONFIG, modelId: JUDGE_MODEL });
for (let attempt = 1; attempt <= 8; attempt += 1) {
  try { await precomputer.precompute(allRuns, cache); break; }
  catch (error) {
    if (error instanceof ProviderRateLimitError && attempt < 8) {
      writeFileSync(join(OUT, "type-spec-cache.json"), JSON.stringify(cache.toJSON(), null, 2));
      const waitMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1)); console.log(`  rate limited (${attempt}/8); backing off ${waitMs}ms...`); await new Promise((r) => setTimeout(r, waitMs)); continue;
    }
    throw error;
  }
}
writeFileSync(join(OUT, "type-spec-cache.json"), JSON.stringify(cache.toJSON(), null, 2));
console.log(`persisted judge cache → ${OUT}/type-spec-cache.json\n\nRun scripts/type-specialist-analysis.ts for per-type recall + team-vs-baseline.`);
