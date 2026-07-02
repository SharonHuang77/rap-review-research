/**
 * Demo: the Research Workbench (RFC-11) over the full pipeline, mock provider.
 *
 * Run with: `npm run demo:workbench`
 *
 *   sample.diff → PR Import → Experiment Engine → Agentless → Validation →
 *   Storage → Evaluation → Export → Research Workbench → presentation views
 *
 * The Workbench is read-only: it computes no metrics, generates no exports, and
 * never calls an LLM. No Bedrock. Nothing written to disk.
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
import { createResearchWorkbench } from "../src/workbench/index.ts";

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

const experiment = await experimentCtx.experiments.findById(run.experimentId);
const stored = await experimentCtx.storage.getExperimentResult(run.experimentId);
if (!experiment || !stored) {
  throw new Error("pipeline did not produce artifacts");
}

// Wire the Workbench to the same storage + snapshot repo, then seed the
// experiment and a recorded export (as a real deployment would).
const wb = createResearchWorkbench({ storage: experimentCtx.storage, snapshots });
wb.experiments.add(experiment);

const comparisons = new EvaluationEngine().evaluateBatch([stored]);
const exportResult = await createExportService().exportComparisons(
  { generatedAt: "2026-07-02T00:00:00.000Z", comparisons },
  "csv",
);
wb.exportHistory.record(exportResult);

console.log("--- getExperiments ---");
console.log(JSON.stringify(await wb.workbench.getExperiments(), null, 2));
console.log("\n--- getExperiment ---");
console.log(JSON.stringify(await wb.workbench.getExperiment(run.experimentId), null, 2));
console.log("\n--- getComparison ---");
console.log(JSON.stringify(await wb.workbench.getComparison(snapshotId), null, 2));
console.log("\n--- getMetrics ---");
console.log(JSON.stringify(await wb.workbench.getMetrics(run.experimentId), null, 2));
console.log("\n--- getReplay (agentless: empty) ---");
console.log(JSON.stringify(await wb.workbench.getReplay(run.experimentId), null, 2));
console.log("\n--- getExportHistory ---");
console.log(JSON.stringify(await wb.workbench.getExportHistory(), null, 2));
