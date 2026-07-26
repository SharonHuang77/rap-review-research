/**
 * Conditioned-sequential review eval (doc-17 follow-up). Per PR, run K agentless
 * passes SEQUENTIALLY: pass j is shown a summary of the findings accumulated in
 * passes 1..j-1 and told to find DIFFERENT issues (explicit diversity, vs the
 * implicit diversity of independent temperature sampling). Reports the cumulative
 * union recall/precision after each pass, so it can be compared to the INDEPENDENT
 * homo ladder at the same temperature (T=0.7: 0.49/0.58/0.61 at K=1/2/3, doc-17
 * tab:ladder). Tests: does conditioning reach the single-model reachable-set
 * ceiling faster (efficiency) without exceeding it, and does the "find new"
 * pressure hurt precision? EXPLORATORY. Run at LLM_TEMPERATURE=0.7.
 *
 * Run: AWS_PROFILE=bedrock LLM_TEMPERATURE=0.7 PILOT_IDS=<100 qodo ids> \
 *   PASSES=3 node scripts/conditioned-eval.ts
 * Env: PILOT_IDS (required), PASSES (=3), LLM_DEFAULT_MODEL (Haiku default),
 *      JUDGE_MODEL, SEMANTIC_THRESHOLD (=0.7), BENCHMARK_DATA_DIR, OUT_DIR (=module-arm).
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
import { ConditionedPromptBuilder, priorDirective } from "../src/architectures/conditioned-prompt-builder.ts";
import { areDuplicateFindings } from "../src/architectures/shared/finding-dedup.ts";

import { BenchmarkLoader } from "../src/campaign/index.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import { GroundTruthEvaluator } from "../src/benchmark/ground-truth-evaluator.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";
import { JudgeScorePrecomputer } from "../src/benchmark/matching/judge-score-precomputer.ts";
import { DEFAULT_JUDGE_CONFIG } from "../src/benchmark/matching/judge-prompt.ts";

if (LLM_CONFIG.provider !== "bedrock") { console.error("conditioned-eval needs the Bedrock provider (live)."); process.exit(1); }

const DATA_DIR = resolve(process.env.BENCHMARK_DATA_DIR ?? "data/benchmark");
const K = Math.max(1, Number(process.env.PASSES ?? 3));
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_CONFIG.modelId;
const OUT = process.env.OUT_DIR ?? "module-arm";
const PILOT = process.env.PILOT_IDS ? new Set(process.env.PILOT_IDS.split(",").map((s) => s.trim()).filter(Boolean)) : undefined;
if (!PILOT) { console.error("set PILOT_IDS"); process.exit(1); }

const dedup = (fs: ReviewFinding[]): ReviewFinding[] => { const o: ReviewFinding[] = []; for (const f of fs) if (!o.some((k) => areDuplicateFindings(k, f))) o.push(f); return o; };

const loader = new BenchmarkLoader();
const full = loader.loadQodo(JSON.parse(readFileSync(resolve(DATA_DIR, "qodo.json"), "utf8")));
const prs = full.instances.filter((i) => PILOT.has(i.instanceId));
console.log(`Conditioned-sequential eval — ${prs.length} PRs, K=${K} passes, model ${LLM_CONFIG.defaultModel} @ ${LLM_CONFIG.region}, temp=${LLM_CONFIG.temperature}`);

const provider = new BedrockProvider();
const builder = new ConditionedPromptBuilder({ loader: new PromptLoader(), contextBuilder: new ContextBuilder() });
const snapshots = new InMemorySnapshotRepository();
const rawDiffStorage = new InMemoryRawDiffStorage();
const registry = new InMemoryArchitectureRegistry();
registry.register(new AgentlessArchitecture({ provider, promptBuilder: builder, rawDiffStorage }));
const importCtx = createPRImportService({ snapshots, rawDiffStorage });
const experimentCtx = createExperimentService({ snapshots, registry });
const svc = experimentCtx.service;
const storage = experimentCtx.storage;
const versions = { modelVersion: LLM_CONFIG.defaultModel, promptVersion: "v1", workflowVersion: "workflow-v1", evaluationVersion: "eval-v1" };

async function onePass(snapshotId: string): Promise<ReviewFinding[]> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await svc.runExperiment({ snapshotId, architecture: "agentless", ...versions, forceRerun: true });
    if (res.status === "completed") {
      const stored = await storage.getExperimentResult(res.experimentId);
      return stored?.validatedResult?.findings ?? [];
    }
    await new Promise((r) => setTimeout(r, Math.min(20_000, 1_500 * 2 ** (attempt - 1))));
  }
  return [];
}

// cumulative union runs per k (one per instance): cum[k-1] = union of passes 1..k
const cum: BenchmarkRun[][] = Array.from({ length: K }, () => []);
let done = 0;
for (const inst of prs) {
  const imported = await importCtx.service.importManualDiff({ title: inst.instanceId, source: "synthetic", rawDiff: inst.rawDiff });
  let acc: ReviewFinding[] = [];
  for (let pass = 1; pass <= K; pass += 1) {
    builder.prior = pass === 1 ? "" : priorDirective(acc);
    const findings = await onePass(imported.snapshotId);
    acc = dedup([...acc, ...findings]);
    cum[pass - 1]!.push({ runId: `${inst.instanceId}#cond${pass}`, datasetId: "qodo-cond", instanceId: inst.instanceId, snapshotId: imported.snapshotId, experimentId: `${inst.instanceId}#cond${pass}`, architecture: "agentless", producedFindings: [...acc], groundTruth: inst.groundTruth, rawDiff: inst.rawDiff });
  }
  done += 1;
  if (done % 20 === 0) console.log(`  ${done}/${prs.length} PRs done`);
}
const unionRuns = cum[K - 1]!;
mkdirSync(resolve(OUT), { recursive: true });
writeFileSync(join(OUT, "conditioned-union-runs.json"), JSON.stringify(unionRuns, null, 2));

// Judge over the final-union findings (superset of every cumulative subset).
const cache = new SemanticScoreCache();
console.log(`\nJUDGE — ${JUDGE_MODEL} over conditioned findings...`);
const precomputer = new JudgeScorePrecomputer(provider, { ...DEFAULT_JUDGE_CONFIG, modelId: JUDGE_MODEL });
await precomputer.precompute(unionRuns, cache);
writeFileSync(join(OUT, "conditioned-cache.json"), JSON.stringify(cache.toJSON(), null, 2));

const semantic = new GroundTruthEvaluator({ matcher: new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(cache), semanticThreshold: TAU }) });
const macro = (runs: BenchmarkRun[]) => { const rs = runs.map((r) => semantic.evaluate(r)); const n = rs.length || 1; return { R: rs.reduce((a, x) => a + x.recall, 0) / n, P: rs.reduce((a, x) => a + x.precision, 0) / n, F1: rs.reduce((a, x) => a + x.f1, 0) / n, f: runs.reduce((a, r) => a + r.producedFindings.length, 0) / n }; };
console.log(`\n=== conditioned-sequential cumulative union (semantic τ=${TAU}) vs independent homo T=0.7 ===`);
console.log(`  independent (doc-17 ladder):  K1 R49%  K2 R58%  K3 R61%`);
for (let k = 1; k <= K; k += 1) { const m = macro(cum[k - 1]!); console.log(`  conditioned K=${k}:  R ${(m.R * 100).toFixed(0)}%  P ${(m.P * 100).toFixed(0)}%  F1 ${m.F1.toFixed(2)}  findings/PR ${m.f.toFixed(1)}`); }
console.log(`\nEfficiency win if conditioned reaches ~61% by fewer passes; ceiling test if it stays <= cross-family; precision drop = the "find new" fabrication failure mode.`);
