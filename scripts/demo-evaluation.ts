/**
 * Demo: full pipeline through evaluation (RFC-07), with a mock provider.
 *
 * Run with: `npm run demo:evaluate`
 *
 *   sample.diff → PR Import → Experiment Engine → Agentless → Validation →
 *   Storage → Evaluation → ExperimentMetrics + ExperimentComparison + export row
 *
 * No Bedrock, no LLM calls.
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
import { toEvaluationExportRow } from "../src/evaluation/index.ts";

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
const metrics = engine.evaluate(stored);
const comparisons = engine.evaluateBatch([stored]);

console.log("--- ExperimentMetrics ---");
console.log(JSON.stringify(metrics, null, 2));
console.log("\n--- ExperimentComparison ---");
console.log(JSON.stringify(comparisons, null, 2));
console.log("\n--- EvaluationExportRow ---");
console.log(JSON.stringify(toEvaluationExportRow(metrics), null, 2));
