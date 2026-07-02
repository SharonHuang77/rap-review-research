/**
 * Demo: full pipeline through export (RFC-10), with a mock provider.
 *
 * Run with: `npm run demo:export`
 *
 *   sample.diff → PR Import → Experiment Engine → Agentless → Validation →
 *   Storage → Evaluation → Export (CSV + JSON research-dataset strings)
 *
 * The Export Service computes no metrics — it consumes the RFC-07 comparisons
 * and serializes them. No Bedrock, no LLM calls, and nothing written to disk.
 */
import { readFileSync } from "node:fs";

import { createPRImportService } from "../src/services/snapshot/index.ts";
import { createExperimentService } from "../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../src/architectures/in-memory-architecture-registry.ts";
import { AgentlessArchitecture } from "../src/architectures/agentless/agentless-architecture.ts";
import { PromptBuilder } from "../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../src/llm/prompts/context-builder.ts";
import { MockProvider } from "../src/llm/provider/mock-provider.ts";
import { EvaluationEngine } from "../src/evaluation/index.ts";
import { createExportService } from "../src/export/index.ts";

const snapshots = new InMemorySnapshotRepository();
const rawDiffStorage = new InMemoryRawDiffStorage();

const modelOutput = JSON.stringify({
  summary: "Adds filtering + a stub component.",
  riskLevel: "medium",
  findings: [
    {
      title: "Non-functional component",
      severity: "medium",
      category: "maintainability",
      file: "src/components/UserList.tsx",
      line: 2,
      description: "Returns null.",
      recommendation: "Implement or remove it.",
      confidence: 0.7,
    },
  ],
});

const registry = new InMemoryArchitectureRegistry();
registry.register(
  new AgentlessArchitecture({
    provider: new MockProvider({ response: { text: modelOutput } }),
    promptBuilder: new PromptBuilder({
      loader: new PromptLoader(),
      contextBuilder: new ContextBuilder(),
    }),
    rawDiffStorage,
  }),
);

const importCtx = createPRImportService({ snapshots, rawDiffStorage });
const experimentCtx = createExperimentService({ snapshots, registry });

const rawDiff = readFileSync(
  new URL("../tests/fixtures/sample.diff", import.meta.url),
  "utf8",
);
const { snapshotId } = await importCtx.service.importManualDiff({
  title: "Add user filtering + list component",
  source: "manual",
  rawDiff,
});
const run = await experimentCtx.service.runExperiment({
  snapshotId,
  architecture: "agentless",
  modelVersion: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  promptVersion: "v1",
  workflowVersion: "workflow-v1",
  evaluationVersion: "eval-v1",
});

const stored = await experimentCtx.storage.getExperimentResult(run.experimentId);
if (!stored) {
  throw new Error("no stored result");
}

const engine = new EvaluationEngine();
const comparisons = engine.evaluateBatch([stored]);

const service = createExportService();
const input = {
  // A fixed timestamp keeps the demo output deterministic.
  generatedAt: "2026-06-28T12:00:00.000Z",
  comparisons,
};

const csv = await service.exportComparisons(input, "csv");
const json = await service.exportComparisons(input, "json");

console.log(`--- CSV export (${csv.fileName}, ${csv.rowCount} rows) ---`);
console.log(csv.content);
console.log(`\n--- JSON export (${json.fileName}, ${json.rowCount} rows) ---`);
console.log(json.content);
