/**
 * Demo: Agentless review end-to-end with a mock provider (RFC-04).
 *
 * Run with: `npm run demo:agentless`
 *
 *   sample.diff → PR Import → snapshot → Experiment Engine → registry →
 *   AgentlessArchitecture → MockProvider → RawReviewResult
 *
 * Uses MockProvider — no Bedrock credentials required. The PR import service,
 * the experiment engine, and Agentless all share one snapshot repository and
 * one raw-diff store.
 */
import { readFileSync } from "node:fs";

import { createPRImportService } from "../src/services/snapshot/index.ts";
import { createExperimentService } from "../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryExperimentRepository } from "../src/repositories/in-memory/in-memory-experiment-repository.ts";
import { InMemoryRawDiffStorage } from "../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../src/architectures/in-memory-architecture-registry.ts";
import { AgentlessArchitecture } from "../src/architectures/agentless/agentless-architecture.ts";
import { PromptBuilder } from "../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../src/llm/prompts/context-builder.ts";
import { MockProvider } from "../src/llm/provider/mock-provider.ts";
import { ConsoleLogger } from "../src/shared/logger.ts";
import type { ReviewExecutionInput } from "../src/models/review-result.ts";

const logger = new ConsoleLogger();
const snapshots = new InMemorySnapshotRepository();
const rawDiffStorage = new InMemoryRawDiffStorage();
const experiments = new InMemoryExperimentRepository();

// Agentless backed by a deterministic mock provider (no Bedrock).
const mockProvider = new MockProvider({
  response: {
    text: JSON.stringify({
      summary: "Adds a null guard and a new list component; low risk.",
      riskLevel: "low",
      findings: [],
    }),
    inputTokens: 850,
    outputTokens: 60,
    latencyMs: 700,
    estimatedCostUsd: 0.00345,
  },
});
const agentless = new AgentlessArchitecture({
  provider: mockProvider,
  promptBuilder: new PromptBuilder({
    loader: new PromptLoader(),
    contextBuilder: new ContextBuilder(),
  }),
  rawDiffStorage,
  logger,
});

const registry = new InMemoryArchitectureRegistry();
registry.register(agentless);

// 1. Import the sample diff.
const importCtx = createPRImportService({ snapshots, rawDiffStorage, logger });
const rawDiff = readFileSync(
  new URL("../tests/fixtures/sample.diff", import.meta.url),
  "utf8",
);
const { snapshotId } = await importCtx.service.importManualDiff({
  title: "Add user filtering + list component",
  source: "manual",
  rawDiff,
});

// 2. Run the experiment through the engine (engine -> registry -> Agentless).
const experimentCtx = createExperimentService({
  snapshots,
  experiments,
  registry,
  logger,
});
const runResult = await experimentCtx.service.runExperiment({
  snapshotId,
  architecture: "agentless",
  modelVersion: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  promptVersion: "v1",
  workflowVersion: "workflow-v1",
  evaluationVersion: "eval-v1",
});

// 3. Also call Agentless directly to display the RawReviewResult it produces.
const snapshot = await snapshots.getById(snapshotId);
const input: ReviewExecutionInput = {
  experimentId: runResult.experimentId,
  snapshot: snapshot!,
  modelVersion: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  promptVersion: "v1",
  workflowVersion: "workflow-v1",
};
const raw = await agentless.execute(input);

console.log("\n--- experiment (engine -> registry -> agentless) ---");
console.log(JSON.stringify(runResult, null, 2));
console.log("status transitions:");
console.log(experiments.statusHistory(runResult.experimentId).join(" -> "));

console.log("\n--- RawReviewResult from AgentlessArchitecture ---");
console.log(JSON.stringify(raw, null, 2));
